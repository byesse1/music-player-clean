from flask import Flask, send_from_directory, request, jsonify, send_file
import json
import uuid
import os
import yt_dlp
import sys
import hashlib
from datetime import datetime
from dotenv import load_dotenv
import requests
from sclib import SoundcloudAPI, Track, Playlist
import time
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Загружаем переменные окружения
load_dotenv()

# Добавляем пути для импорта модулей
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import db, User, Track, UserTrack, Playlist, PlaylistTrack, Friendship, FriendInvite, PlaylistLike
from sound import remove_vocals, boost_bass
from pydub import AudioSegment
import boto3

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(BASE_DIR)
PROJECT_DIR = os.path.dirname(APP_DIR)

# ========== НАСТРОЙКА БАЗЫ ДАННЫХ ==========
DATABASE_URL = 'sqlite:///music_player.db'

app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

# ========== ПУТИ К ПАПКАМ ==========
TEMP_DIR = os.path.join(PROJECT_DIR, "resources", "Temp")
os.makedirs(TEMP_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {'mp3', 'wav', 'ogg', 'm4a'}
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ========== НАСТРОЙКА YANDEX CLOUD OBJECT STORAGE ==========
YANDEX_ACCESS_KEY = os.getenv('YANDEX_ACCESS_KEY')
YANDEX_SECRET_KEY = os.getenv('YANDEX_SECRET_KEY')
YANDEX_BUCKET = os.getenv('YANDEX_BUCKET')
YANDEX_ENDPOINT = os.getenv('YANDEX_ENDPOINT', 'https://storage.yandexcloud.net')

s3_client = boto3.client(
    service_name='s3',
    endpoint_url=YANDEX_ENDPOINT,
    aws_access_key_id=YANDEX_ACCESS_KEY,
    aws_secret_access_key=YANDEX_SECRET_KEY,
)


def upload_to_yandex(file_path, object_key):
    """Загружает файл в облако и возвращает публичную ссылку"""
    try:
        s3_client.upload_file(
            file_path,
            YANDEX_BUCKET,
            object_key,
            ExtraArgs={'ACL': 'public-read'}
        )
        return f"https://{YANDEX_BUCKET}.storage.yandexcloud.net/{object_key}"
    except Exception as e:
        print(f"❌ Ошибка загрузки в облако: {e}")
        return None


def delete_from_yandex(object_key):
    """Удаляет файл из облака"""
    try:
        s3_client.delete_object(Bucket=YANDEX_BUCKET, Key=object_key)
        print(f"🗑️ Файл удалён из облака: {object_key}")
        return True
    except Exception as e:
        print(f"❌ Ошибка удаления из облака: {e}")
        return False


def file_exists_in_yandex(object_key):
    """Проверяет, существует ли файл в облаке"""
    try:
        s3_client.head_object(Bucket=YANDEX_BUCKET, Key=object_key)
        return True
    except:
        return False


def get_yandex_url(object_key):
    """Возвращает публичную ссылку на файл в облаке"""
    return f"https://{YANDEX_BUCKET}.storage.yandexcloud.net/{object_key}"


def get_playlist_like_count(playlist_id):
    return PlaylistLike.query.filter_by(playlist_id=playlist_id).count()


def is_playlist_liked_by_user(playlist_id, user_id):
    if not user_id:
        return False
    return PlaylistLike.query.filter_by(playlist_id=playlist_id, user_id=user_id).first() is not None


def playlist_to_public_dict(playlist, viewer_id=None):
    data = playlist.to_dict()
    owner = User.query.get(playlist.user_id)
    data.update({
        "owner": owner.username if owner else "Unknown",
        "owner_id": playlist.user_id,
        "like_count": get_playlist_like_count(playlist.id),
        "liked_by_me": is_playlist_liked_by_user(playlist.id, viewer_id)
    })
    return data


def are_friends(user_id, friend_id):
    return Friendship.query.filter_by(user_id=user_id, friend_id=friend_id).first() is not None


def add_friendship_pair(user_id, friend_id):
    if user_id == friend_id:
        return
    if not are_friends(user_id, friend_id):
        db.session.add(Friendship(user_id=user_id, friend_id=friend_id))
    if not are_friends(friend_id, user_id):
        db.session.add(Friendship(user_id=friend_id, friend_id=user_id))


def copy_playlist_to_user(source_playlist, target_user):
    if source_playlist.user_id != target_user.id:
        copy_name = f"Плейлист друга: {source_playlist.name}"
    else:
        copy_name = f"Копия: {source_playlist.name}"

    existing_count = Playlist.query.filter(
        Playlist.user_id == target_user.id,
        Playlist.name.like(f"{copy_name}%")
    ).count()
    if existing_count:
        copy_name = f"{copy_name} ({existing_count + 1})"

    new_playlist = Playlist(
        name=copy_name,
        description=source_playlist.description,
        cover_art=source_playlist.cover_art,
        user_id=target_user.id
    )
    db.session.add(new_playlist)
    db.session.flush()

    source_tracks = PlaylistTrack.query.filter_by(
        playlist_id=source_playlist.id
    ).order_by(PlaylistTrack.order_position).all()

    for idx, playlist_track in enumerate(source_tracks):
        db.session.add(PlaylistTrack(
            playlist_id=new_playlist.id,
            track_id=playlist_track.track_id,
            order_position=idx
        ))

    return new_playlist


# Создание таблиц при запуске
with app.app_context():
    db.create_all()
    print("✅ База данных инициализирована")
    print(f"📁 Временная папка: {TEMP_DIR}")


# ========== МАРШРУТЫ ==========
@app.route('/')
def index():
    return send_from_directory(os.path.join(APP_DIR, 'Frontend'), 'ssite.html')


@app.route('/<path:path>')
def front_files(path):
    return send_from_directory(os.path.join(APP_DIR, 'Frontend'), path)


# ========== API АВТОРИЗАЦИИ ==========
@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.json
        username = data.get('nick')
        password = data.get('password')

        if not username or not password:
            return jsonify({"error": "Заполните все поля"}), 400

        existing_user = User.query.filter_by(username=username).first()
        if existing_user:
            return jsonify({"error": "Ник уже занят"}), 400

        new_user = User(username=username)
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.flush()

        main_playlist = Playlist(
            name="Все треки",
            description="Все ваши треки",
            is_main=True,
            user_id=new_user.id
        )
        db.session.add(main_playlist)
        db.session.add(FriendInvite(
            token=uuid.uuid4().hex,
            user_id=new_user.id
        ))
        db.session.commit()

        print(f"✅ Новый пользователь: {username}")
        return jsonify({"ok": True, "message": "Регистрация успешна"})

    except Exception as e:
        db.session.rollback()
        print(f"❌ Ошибка регистрации: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.json
        username = data.get('nick')
        password = data.get('password')

        user = User.query.filter_by(username=username).first()

        if not user:
            return jsonify({"error": "Пользователь не найден"}), 400

        if not user.check_password(password):
            return jsonify({"error": "Неверный пароль"}), 400

        user_tracks = UserTrack.query.filter_by(user_id=user.id).order_by(UserTrack.order_position).all()
        playlist = [ut.to_dict() for ut in user_tracks]

        print(f"✅ Вход пользователя: {username} (треков: {len(playlist)})")

        return jsonify({
            "ok": True,
            "playlist": playlist
        })

    except Exception as e:
        print(f"❌ Ошибка входа: {e}")
        return jsonify({"error": str(e)}), 500


# ========== API ЗАГРУЗКИ ==========
@app.route('/api/upload', methods=['POST'])
def upload_file():
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "Нет файла"}), 400

        file = request.files['audio']
        username = request.form.get('nick', 'unknown')

        if file.filename == '':
            return jsonify({"error": "Файл не выбран"}), 400

        if not allowed_file(file.filename):
            return jsonify({"error": "Неподдерживаемый формат"}), 400

        original_name = file.filename
        ext = original_name.rsplit('.', 1)[1].lower()
        name_without_ext = original_name.rsplit('.', 1)[0]

        unique_id = uuid.uuid4().hex
        temp_path = os.path.join(TEMP_DIR, f"temp_{unique_id}.{ext}")
        file.save(temp_path)

        object_key = f"music/{unique_id}.{ext}"
        file_url = upload_to_yandex(temp_path, object_key)

        if os.path.exists(temp_path):
            os.remove(temp_path)

        if not file_url:
            return jsonify({"error": "Ошибка загрузки в облако"}), 500

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404

        new_track = Track(
            title=name_without_ext,
            artist="Unknown",
            file_path=file_url,
            duration=0,
            youtube_id=None
        )

        db.session.add(new_track)
        db.session.flush()

        main_playlist = Playlist.query.filter_by(user_id=user.id, is_main=True).first()
        if main_playlist:
            existing = PlaylistTrack.query.filter_by(
                playlist_id=main_playlist.id,
                track_id=new_track.id
            ).first()
            if not existing:
                max_order_main = db.session.query(db.func.max(PlaylistTrack.order_position)).filter_by(
                    playlist_id=main_playlist.id
                ).scalar() or 0
                playlist_track_main = PlaylistTrack(
                    playlist_id=main_playlist.id,
                    track_id=new_track.id,
                    order_position=max_order_main + 1
                )
                db.session.add(playlist_track_main)

        max_order = db.session.query(db.func.max(UserTrack.order_position)).filter_by(user_id=user.id).scalar() or 0
        user_track = UserTrack(
            user_id=user.id,
            track_id=new_track.id,
            order_position=max_order + 1
        )
        db.session.add(user_track)
        db.session.commit()

        print(f"✅ Загружен файл: {original_name} в облако для {username}")

        return jsonify({
            "ok": True,
            "original_name": name_without_ext,
            "url": file_url
        })

    except Exception as e:
        db.session.rollback()
        print(f"❌ Ошибка загрузки: {e}")
        return jsonify({"error": str(e)}), 500


# ========== API ПЛЕЙЛИСТА ==========
@app.route('/api/save_playlist', methods=['POST'])
def save_playlist():
    try:
        data = request.json
        username = data.get('nick')
        playlist_data = data.get('playlist')

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 400

        for idx, track_info in enumerate(playlist_data):
            track = Track.query.filter_by(file_path=track_info.get('url')).first()
            if track:
                user_track = UserTrack.query.filter_by(user_id=user.id, track_id=track.id).first()
                if user_track:
                    user_track.order_position = idx

        db.session.commit()

        print(f"✅ Сохранён порядок плейлиста для {username}: {len(playlist_data)} треков")
        return jsonify({"ok": True})

    except Exception as e:
        db.session.rollback()
        print(f"❌ Ошибка сохранения плейлиста: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/delete_track', methods=['POST'])
def delete_track():
    try:
        data = request.json
        username = data.get('nick')
        track_url = data.get('track_url')

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 400

        track = Track.query.filter_by(file_path=track_url).first()
        if not track:
            return jsonify({"error": "Трек не найден"}), 404

        playlist_tracks = PlaylistTrack.query.filter_by(track_id=track.id).all()
        for pt in playlist_tracks:
            db.session.delete(pt)

        user_track = UserTrack.query.filter_by(user_id=user.id, track_id=track.id).first()
        if user_track:
            db.session.delete(user_track)

        other_users = UserTrack.query.filter_by(track_id=track.id).count()

        if other_users == 0:
            if track.file_path and track.file_path.startswith('https://'):
                object_key = track.file_path.replace(f"https://{YANDEX_BUCKET}.storage.yandexcloud.net/", "")
                delete_from_yandex(object_key)

        db.session.delete(track)
        db.session.commit()

        user_tracks = UserTrack.query.filter_by(user_id=user.id).order_by(UserTrack.order_position).all()
        playlist = [ut.to_dict() for ut in user_tracks]

        print(f"✅ Трек полностью удален для {username}")
        return jsonify({"ok": True, "playlist": playlist})

    except Exception as e:
        db.session.rollback()
        print(f"❌ Ошибка удаления трека: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/shuffle_playlist', methods=['POST'])
def shuffle_playlist():
    try:
        data = request.json
        username = data.get('nick')

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 400

        import random
        user_tracks = UserTrack.query.filter_by(user_id=user.id).all()

        positions = list(range(len(user_tracks)))
        random.shuffle(positions)

        for ut, new_pos in zip(user_tracks, positions):
            ut.order_position = new_pos

        db.session.commit()

        user_tracks = UserTrack.query.filter_by(user_id=user.id).order_by(UserTrack.order_position).all()
        playlist = [ut.to_dict() for ut in user_tracks]

        print(f"🔀 Плейлист перемешан для {username}")
        return jsonify({"ok": True, "playlist": playlist})

    except Exception as e:
        db.session.rollback()
        print(f"❌ Ошибка перемешивания: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/user_profile', methods=['POST'])
def user_profile():
    try:
        data = request.json
        username = data.get('nick')

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 400

        track_count = UserTrack.query.filter_by(user_id=user.id).count()
        user_tracks = UserTrack.query.filter_by(user_id=user.id).order_by(UserTrack.order_position).all()
        playlist = [ut.to_dict() for ut in user_tracks]

        return jsonify({
            "ok": True,
            "nick": username,
            "track_count": track_count,
            "playlist_count": Playlist.query.filter_by(user_id=user.id).count(),
            "friend_count": Friendship.query.filter_by(user_id=user.id).count(),
            "playlist": playlist
        })

    except Exception as e:
        print(f"❌ Ошибка профиля: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/check_nick', methods=['POST'])
def check_nick():
    try:
        data = request.json
        new_nick = data.get('nick')

        existing = User.query.filter_by(username=new_nick).first()
        return jsonify({"exists": existing is not None})

    except Exception as e:
        print(f"❌ Ошибка проверки ника: {e}")
        return jsonify({"exists": False}), 500


@app.route('/api/update_nick', methods=['POST'])
def update_nick():
    try:
        data = request.json
        old_nick = data.get('old_nick')
        new_nick = data.get('new_nick')

        user = User.query.filter_by(username=old_nick).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404

        user.username = new_nick
        db.session.commit()

        print(f"📝 Пользователь {old_nick} сменил имя на {new_nick}")
        return jsonify({"ok": True})

    except Exception as e:
        db.session.rollback()
        print(f"❌ Ошибка обновления ника: {e}")
        return jsonify({"error": str(e)}), 500


# ========== API ДРУЗЕЙ ==========
@app.route('/api/friends/list', methods=['POST'])
def friends_list():
    try:
        data = request.json or {}
        username = data.get('nick')

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404

        links = Friendship.query.filter_by(user_id=user.id).all()
        friends = []
        for link in links:
            friend = link.friend
            if not friend:
                continue
            friends.append({
                "id": friend.id,
                "nick": friend.username,
                "track_count": UserTrack.query.filter_by(user_id=friend.id).count(),
                "playlist_count": Playlist.query.filter_by(user_id=friend.id).count(),
                "friend_count": Friendship.query.filter_by(user_id=friend.id).count()
            })

        friends.sort(key=lambda item: item["nick"].lower())
        return jsonify({"ok": True, "friends": friends})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/friends/invite', methods=['POST'])
def friends_invite():
    try:
        data = request.json or {}
        username = data.get('nick')

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404

        invite = FriendInvite.query.filter_by(user_id=user.id).order_by(FriendInvite.created_at.desc()).first()
        if not invite:
            invite = FriendInvite(token=uuid.uuid4().hex, user_id=user.id)
            db.session.add(invite)
            db.session.commit()

        return jsonify({
            "ok": True,
            "token": invite.token,
            "invite_path": f"/?invite={invite.token}"
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route('/api/friends/add', methods=['POST'])
def friends_add():
    try:
        data = request.json or {}
        username = data.get('nick')
        raw_token = (data.get('token') or '').strip()

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404

        if 'invite=' in raw_token:
            raw_token = raw_token.split('invite=', 1)[1].split('&', 1)[0]

        invite = FriendInvite.query.filter_by(token=raw_token).first()
        if not invite or not invite.user:
            return jsonify({"error": "Приглашение не найдено"}), 404

        if invite.user_id == user.id:
            return jsonify({"error": "Нельзя добавить самого себя"}), 400

        add_friendship_pair(user.id, invite.user_id)
        db.session.commit()

        return jsonify({
            "ok": True,
            "friend": {
                "id": invite.user.id,
                "nick": invite.user.username
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route('/api/users/public_profile', methods=['POST'])
def public_profile():
    try:
        data = request.json or {}
        viewer_name = data.get('nick')
        target_name = data.get('target_nick')

        viewer = User.query.filter_by(username=viewer_name).first()
        target = User.query.filter_by(username=target_name).first()

        if not viewer:
            return jsonify({"error": "Пользователь не найден"}), 404
        if not target:
            return jsonify({"error": "Профиль не найден"}), 404

        library = UserTrack.query.filter_by(user_id=target.id).order_by(UserTrack.order_position).all()
        playlists = Playlist.query.filter_by(user_id=target.id).order_by(Playlist.created_at.desc()).all()

        return jsonify({
            "ok": True,
            "profile": {
                "id": target.id,
                "nick": target.username,
                "track_count": UserTrack.query.filter_by(user_id=target.id).count(),
                "playlist_count": Playlist.query.filter_by(user_id=target.id).count(),
                "friend_count": Friendship.query.filter_by(user_id=target.id).count(),
                "created_at": target.created_at.isoformat() if target.created_at else None,
                "is_self": viewer.id == target.id,
                "is_friend": are_friends(viewer.id, target.id)
            },
            "library": [item.to_dict() for item in library],
            "playlists": [playlist_to_public_dict(playlist, viewer.id) for playlist in playlists]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/public_playlist', methods=['POST'])
def public_playlist():
    try:
        data = request.json or {}
        viewer_name = data.get('nick')
        playlist_id = data.get('playlist_id')

        viewer = User.query.filter_by(username=viewer_name).first()
        playlist = Playlist.query.filter_by(id=playlist_id).first()

        if not viewer:
            return jsonify({"error": "Пользователь не найден"}), 404
        if not playlist:
            return jsonify({"error": "Плейлист не найден"}), 404

        playlist_tracks = PlaylistTrack.query.filter_by(
            playlist_id=playlist.id
        ).order_by(PlaylistTrack.order_position).all()

        tracks = []
        for pt in playlist_tracks:
            track = pt.track
            tracks.append({
                'name': track.title,
                'artist': track.artist,
                'url': track.file_path,
                'cover': track.cover_art
            })

        return jsonify({
            "ok": True,
            "playlist": playlist_to_public_dict(playlist, viewer.id),
            "tracks": tracks
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/playlists/like', methods=['POST'])
def playlists_like():
    try:
        data = request.json or {}
        username = data.get('nick')
        playlist_id = data.get('playlist_id')

        user = User.query.filter_by(username=username).first()
        playlist = Playlist.query.filter_by(id=playlist_id).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404
        if not playlist:
            return jsonify({"error": "Плейлист не найден"}), 404

        existing = PlaylistLike.query.filter_by(user_id=user.id, playlist_id=playlist.id).first()
        liked = False
        if existing:
            db.session.delete(existing)
        else:
            db.session.add(PlaylistLike(user_id=user.id, playlist_id=playlist.id))
            liked = True

        db.session.commit()
        return jsonify({
            "ok": True,
            "liked": liked,
            "like_count": get_playlist_like_count(playlist.id)
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route('/api/playlists/copy', methods=['POST'])
def playlists_copy():
    try:
        data = request.json or {}
        username = data.get('nick')
        playlist_id = data.get('playlist_id')

        user = User.query.filter_by(username=username).first()
        source_playlist = Playlist.query.filter_by(id=playlist_id).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404
        if not source_playlist:
            return jsonify({"error": "Плейлист не найден"}), 404

        new_playlist = copy_playlist_to_user(source_playlist, user)
        db.session.commit()

        return jsonify({
            "ok": True,
            "playlist": playlist_to_public_dict(new_playlist, user.id)
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@app.route('/api/playlists/top', methods=['POST'])
def playlists_top():
    try:
        data = request.json or {}
        viewer_name = data.get('nick')
        viewer = User.query.filter_by(username=viewer_name).first() if viewer_name else None

        playlists = Playlist.query.filter_by(is_main=False).all()
        if not playlists:
            playlists = Playlist.query.all()

        ranked = [playlist_to_public_dict(playlist, viewer.id if viewer else None) for playlist in playlists]
        ranked.sort(key=lambda item: (-item["like_count"], item["name"].lower()))

        return jsonify({
            "ok": True,
            "playlists": ranked[:20]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ========== API ПОИСКА И СКАЧИВАНИЯ (SoundCloud) ==========
# Создайте сессию с повторными попытками для устойчивости к сбоям
def get_requests_session():
    session = requests.Session()
    retries = Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
    session.mount('https://', HTTPAdapter(max_retries=retries))
    return session

@app.route('/api/search_tracks', methods=['POST'])
def search_tracks():
    try:
        data = request.json
        query = data.get('query', '').strip()

        if not query:
            return jsonify({"error": "Введите поисковый запрос"}), 400

        print(f"🔍 Поиск на SoundCloud: {query}")

        # ⚠️ ВСТАВЬТЕ РЕАЛЬНЫЙ CLIENT_ID (не плейсхолдер!)
        CLIENT_ID = "YsQ6pTOcGQdVYY9A4FIt9mLk5pTkEXsB"

        search_url = f"https://api-v2.soundcloud.com/search/tracks?q={query}&client_id={CLIENT_ID}&limit=15"

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://soundcloud.com',
            'Referer': 'https://soundcloud.com/discover',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site'
        }

        session = requests.Session()
        response = session.get(search_url, headers=headers, timeout=30)

        print(f"📡 Статус ответа: {response.status_code}")
        print(f"📄 Тип содержимого: {response.headers.get('content-type', 'unknown')}")

        # Проверяем, что ответ — это JSON, а не HTML
        if 'application/json' not in response.headers.get('content-type', ''):
            print(f"❌ Получен не JSON, а {response.headers.get('content-type')}")
            print(f"📄 Первые 200 символов ответа: {response.text[:200]}")
            return jsonify({"error": "SoundCloud вернул неожиданный ответ. Возможно, IP заблокирован."}), 500

        if response.status_code != 200:
            print(f"❌ Ошибка SoundCloud API: {response.status_code}")
            return jsonify({"error": f"Ошибка SoundCloud: {response.status_code}"}), 500

        # Теперь безопасно парсим JSON
        soundcloud_data = response.json()
        
        # Проверяем, что получили словарь
        if not isinstance(soundcloud_data, dict):
            print(f"❌ Неожиданный тип данных: {type(soundcloud_data)}")
            return jsonify({"error": "SoundCloud вернул некорректные данные"}), 500

        results = []
        collection = soundcloud_data.get('collection', [])
        
        for track in collection:
            if not isinstance(track, dict):
                continue
            if track.get('kind') == 'track':
                # Безопасно получаем значения с защитой от отсутствия ключей
                user = track.get('user', {})
                results.append({
                    "id": str(track.get('id', '')),
                    "name": (track.get('title', 'Без названия') or 'Без названия')[:100],
                    "artist": (user.get('username', 'Неизвестный исполнитель') or 'Неизвестный исполнитель')[:50],
                    "source": "soundcloud",
                    "duration": (track.get('duration', 0) or 0) // 1000,
                    "downloadable": track.get('downloadable', False),
                    "stream_url": track.get('stream_url', ''),
                    "permalink_url": track.get('permalink_url', ''),
                    "artwork_url": track.get('artwork_url', '')
                })

        print(f"✅ Найдено: {len(results)} треков")
        return jsonify({"ok": True, "results": results})

    except requests.exceptions.JSONDecodeError as e:
        print(f"❌ Ошибка парсинга JSON: {e}")
        print(f"📄 Текст ответа: {response.text[:500] if 'response' in locals() else 'Нет ответа'}")
        return jsonify({"error": "SoundCloud вернул некорректный JSON. Возможно, требуется обновить client_id."}), 500
    except Exception as e:
        print(f"❌ Ошибка поиска: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
        
@app.route('/api/download_track', methods=['POST'])
def download_track():
    temp_path = None
    try:
        data = request.json
        track_info = data.get('track')
        username = data.get('nick')

        if not track_info:
            return jsonify({"error": "Нет информации о треке"}), 400

        track_url = track_info.get('permalink_url')
        track_name = track_info.get('name', 'track')
        artist = track_info.get('artist', 'Unknown')

        print(f"📥 Скачивание с SoundCloud через yt-dlp: {artist} - {track_name}")

        # Настройки yt-dlp для скачивания аудио в MP3
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': os.path.join(TEMP_DIR, '%(title)s.%(ext)s'),
            'quiet': True,
            'no_warnings': True,
            'ignoreerrors': True,
            # Добавляем заголовки, чтобы имитировать браузер
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-us,en;q=0.5',
                'Sec-Fetch-Mode': 'navigate',
            }
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Извлекаем информацию о треке
            info = ydl.extract_info(track_url, download=False)

            # Проверяем, можно ли скачать трек
            if not info.get('is_downloadable', True):
                return jsonify(
                    {"error": "Этот трек доступен только для онлайн-прослушивания, скачивание запрещено автором"}), 400

            # Скачиваем трек
            ydl.params['outtmpl'] = os.path.join(TEMP_DIR, f"%(title)s_%(id)s.%(ext)s")
            ydl.download([track_url])

            # Ищем скачанный файл
            downloaded_files = [f for f in os.listdir(TEMP_DIR) if f.endswith('.mp3') and '_' in f]
            if not downloaded_files:
                return jsonify({"error": "Не удалось найти скачанный файл"}), 500

            # Берём самый новый файл
            temp_file = max(downloaded_files, key=lambda f: os.path.getctime(os.path.join(TEMP_DIR, f)))
            temp_path = os.path.join(TEMP_DIR, temp_file)

        # Загружаем в Yandex Cloud
        safe_name = f"{artist} - {track_name}"[:80]
        safe_name = "".join(c for c in safe_name if c.isalnum() or c in (' ', '-', '_', '(', ')', '&'))
        unique_id = uuid.uuid4().hex[:8]
        object_key = f"music/soundcloud_{unique_id}_{safe_name}.mp3"

        file_url = upload_to_yandex(temp_path, object_key)

        if not file_url:
            return jsonify({"error": "Ошибка загрузки файла в облако"}), 500

        # Сохраняем в базу данных (та же логика)
        user = User.query.filter_by(username=username).first()
        if user:
            existing_track = Track.query.filter_by(youtube_id=track_url).first()

            if not existing_track:
                new_track = Track(
                    title=track_name,
                    artist=artist,
                    file_path=file_url,
                    youtube_id=track_url,
                    duration=track_info.get('duration', 0),
                    cover_art=track_info.get('artwork_url')
                )
                db.session.add(new_track)
                db.session.flush()
                track_id_db = new_track.id
            else:
                track_id_db = existing_track.id

            existing_user_track = UserTrack.query.filter_by(
                user_id=user.id,
                track_id=track_id_db
            ).first()

            if not existing_user_track:
                max_order = db.session.query(db.func.max(UserTrack.order_position)).filter_by(
                    user_id=user.id).scalar() or 0
                user_track = UserTrack(
                    user_id=user.id,
                    track_id=track_id_db,
                    order_position=max_order + 1
                )
                db.session.add(user_track)

                main_playlist = Playlist.query.filter_by(user_id=user.id, is_main=True).first()
                if main_playlist and not PlaylistTrack.query.filter_by(playlist_id=main_playlist.id,
                                                                       track_id=track_id_db).first():
                    max_order_main = db.session.query(db.func.max(PlaylistTrack.order_position)).filter_by(
                        playlist_id=main_playlist.id
                    ).scalar() or 0
                    db.session.add(PlaylistTrack(
                        playlist_id=main_playlist.id,
                        track_id=track_id_db,
                        order_position=max_order_main + 1
                    ))

                db.session.commit()
                print(f"✅ Трек добавлен в библиотеку {username}")

        return jsonify({
            "ok": True,
            "original_name": f"{artist} - {track_name}",
            "url": file_url
        })

    except Exception as e:
        db.session.rollback()
        print(f"❌ Ошибка скачивания: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    finally:
        # Удаляем временный файл в любом случае
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass

# ========== API АУДИОРЕДАКТОРА ==========
@app.route('/api/process_audio', methods=['POST'])
def process_audio():
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "Нет файла"}), 400

        file = request.files['audio']
        effect = request.form.get('effect')
        bass_level = int(request.form.get('bass_level', 5))

        unique_id = uuid.uuid4().hex
        input_path = os.path.join(TEMP_DIR, f"temp_{unique_id}.mp3")
        original_name_without_ext = os.path.splitext(file.filename)[0]

        if effect == 'remove_vocals':
            output_filename = f"{original_name_without_ext}_no_voice.mp3"
        elif effect == 'boost_bass':
            output_filename = f"{original_name_without_ext}_bass_boost.mp3"
        else:
            output_filename = f"processed_{unique_id}.mp3"

        output_path = os.path.join(TEMP_DIR, output_filename)
        file.save(input_path)

        success = False
        if effect == 'remove_vocals':
            success = remove_vocals(input_path, output_path)
        elif effect == 'boost_bass':
            success = boost_bass(input_path, output_path, bass_level)

        if os.path.exists(input_path):
            os.remove(input_path)

        if success and os.path.exists(output_path):
            return send_file(
                output_path,
                as_attachment=True,
                download_name=output_filename,
                mimetype="audio/mpeg"
            )
        else:
            return jsonify({"error": "Ошибка обработки"}), 500

    except Exception as e:
        print(f"❌ Ошибка обработки: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/process_equalizer', methods=['POST'])
def process_equalizer():
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "Нет файла"}), 400

        file = request.files['audio']
        bass_level = int(request.form.get('bass_level', 5))
        speed_level = float(request.form.get('speed_level', 1.0))

        unique_id = uuid.uuid4().hex
        input_path = os.path.join(TEMP_DIR, f"temp_{unique_id}.mp3")
        original_name_without_ext = os.path.splitext(file.filename)[0]

        output_filename = f"{original_name_without_ext}_equalizer_bass{bass_level}_speed{speed_level}.mp3"
        output_path = os.path.join(TEMP_DIR, output_filename)

        file.save(input_path)

        audio = AudioSegment.from_file(input_path)

        if bass_level != 5:
            low = audio.low_pass_filter(200)
            high = audio.high_pass_filter(200)
            boost = bass_level - 5
            low = low + boost
            audio = low.overlay(high)

        if speed_level != 1.0:
            temp_wav = os.path.join(TEMP_DIR, f"temp_eq_{unique_id}.wav")
            audio.export(temp_wav, format="wav")

            import librosa
            y, sr = librosa.load(temp_wav, sr=None)
            y_stretched = librosa.effects.time_stretch(y, rate=speed_level)

            import soundfile as sf
            sf.write(temp_wav, y_stretched, sr)

            audio = AudioSegment.from_wav(temp_wav)
            os.remove(temp_wav)

        audio.export(output_path, format="mp3", bitrate="320k")

        if os.path.exists(input_path):
            os.remove(input_path)

        print(f"✅ Обработан файл: {output_filename} (бас: {bass_level}, скорость: {speed_level})")

        return send_file(
            output_path,
            as_attachment=True,
            download_name=output_filename,
            mimetype="audio/mpeg"
        )

    except Exception as e:
        print(f"❌ Ошибка обработки: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ========== API ПОЛУЧЕНИЯ ДЛИТЕЛЬНОСТИ ==========
@app.route('/api/get_duration', methods=['POST'])
def get_duration():
    try:
        data = request.json
        file_path = data.get('file_path')

        if not file_path:
            return jsonify({"error": "Не указан путь к файлу"}), 400

        # Если файл в облаке, скачиваем временно
        if file_path.startswith('https://'):
            import requests as req
            temp_path = os.path.join(TEMP_DIR, f"temp_duration_{uuid.uuid4().hex}.mp3")
            response = req.get(file_path)
            with open(temp_path, 'wb') as f:
                f.write(response.content)
            full_path = temp_path
            is_temp = True
        else:
            full_path = file_path
            is_temp = False

        if not os.path.exists(full_path):
            return jsonify({"error": "Файл не найден"}), 404

        from pydub import AudioSegment
        audio = AudioSegment.from_file(full_path)
        duration = int(len(audio) / 1000)

        if is_temp and os.path.exists(full_path):
            os.remove(full_path)

        track = Track.query.filter_by(file_path=file_path).first()
        if track and track.duration == 0:
            track.duration = duration
            db.session.commit()

        return jsonify({"ok": True, "duration": duration})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ========== API ОБЛОЖЕК ==========
@app.route('/api/save_track_cover', methods=['POST'])
def save_track_cover():
    try:
        data = request.json
        track_url = data.get('track_url')
        cover_data = data.get('cover_data')

        if not track_url or not cover_data:
            return jsonify({"error": "Нет данных"}), 400

        track_hash = hashlib.md5(track_url.encode()).hexdigest()[:10]
        object_key = f"covers/{track_hash}.jpg"

        temp_path = os.path.join(TEMP_DIR, f"temp_cover_{track_hash}.jpg")

        if ',' in cover_data:
            cover_data = cover_data.split(',')[1]

        import base64
        cover_bytes = base64.b64decode(cover_data)

        with open(temp_path, 'wb') as f:
            f.write(cover_bytes)

        cover_url = upload_to_yandex(temp_path, object_key)

        if os.path.exists(temp_path):
            os.remove(temp_path)

        if not cover_url:
            return jsonify({"error": "Ошибка загрузки обложки в облако"}), 500

        track = Track.query.filter_by(file_path=track_url).first()
        if track:
            track.cover_art = cover_url
            db.session.commit()

        print(f"✅ Обложка сохранена в облако: {cover_url}")

        return jsonify({
            "ok": True,
            "cover_url": cover_url
        })

    except Exception as e:
        db.session.rollback()
        print(f"❌ Ошибка сохранения обложки: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/get_track_cover', methods=['POST'])
def get_track_cover():
    try:
        data = request.json
        track_url = data.get('track_url')

        if not track_url:
            return jsonify({"error": "Нет URL трека"}), 400

        track = Track.query.filter_by(file_path=track_url).first()
        if track and track.cover_art:
            return jsonify({"ok": True, "cover_url": track.cover_art})

        return jsonify({"ok": True, "cover_url": None})

    except Exception as e:
        print(f"❌ Ошибка получения обложки: {e}")
        return jsonify({"error": str(e)}), 500


# ========== API ПЛЕЙЛИСТОВ ==========
@app.route('/api/playlists', methods=['POST'])
def get_user_playlists():
    try:
        data = request.json
        username = data.get('nick')

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404

        playlists = Playlist.query.filter_by(user_id=user.id).order_by(Playlist.created_at.desc()).all()

        return jsonify({
            "ok": True,
            "playlists": [playlist_to_public_dict(p, user.id) for p in playlists]
        })
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/create_playlist', methods=['POST'])
def create_playlist():
    try:
        data = request.json
        username = data.get('nick')
        name = data.get('name')
        description = data.get('description', '')
        cover_data = data.get('cover_data')

        if not name:
            return jsonify({"error": "Введите название плейлиста"}), 400

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404

        new_playlist = Playlist(
            name=name,
            description=description,
            cover_art=cover_data,
            user_id=user.id
        )

        db.session.add(new_playlist)
        db.session.commit()

        print(f"✅ Создан плейлист: {name} для {username}")
        return jsonify({"ok": True, "playlist": playlist_to_public_dict(new_playlist, user.id)})

    except Exception as e:
        db.session.rollback()
        print(f"❌ Ошибка: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/add_to_playlist', methods=['POST'])
def add_to_playlist():
    try:
        data = request.json
        username = data.get('nick')
        playlist_id = data.get('playlist_id')
        track_url = data.get('track_url')

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404

        playlist = Playlist.query.filter_by(id=playlist_id, user_id=user.id).first()
        if not playlist:
            return jsonify({"error": "Плейлист не найден"}), 404

        track = Track.query.filter_by(file_path=track_url).first()
        if not track:
            return jsonify({"error": "Трек не найден"}), 404

        existing = PlaylistTrack.query.filter_by(
            playlist_id=playlist_id,
            track_id=track.id
        ).first()

        if existing:
            return jsonify({"error": "Трек уже в плейлисте"}), 400

        max_order = db.session.query(db.func.max(PlaylistTrack.order_position)).filter_by(
            playlist_id=playlist_id
        ).scalar() or 0

        playlist_track = PlaylistTrack(
            playlist_id=playlist_id,
            track_id=track.id,
            order_position=max_order + 1
        )

        db.session.add(playlist_track)
        db.session.commit()

        return jsonify({"ok": True, "message": "Трек добавлен"})

    except Exception as e:
        db.session.rollback()
        print(f"❌ Ошибка: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/remove_from_playlist', methods=['POST'])
def remove_from_playlist():
    try:
        data = request.json
        username = data.get('nick')
        playlist_id = data.get('playlist_id')
        track_url = data.get('track_url')

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404

        track = Track.query.filter_by(file_path=track_url).first()
        if not track:
            return jsonify({"error": "Трек не найден"}), 404

        playlist = Playlist.query.filter_by(id=playlist_id, user_id=user.id).first()
        if not playlist:
            return jsonify({"error": "Плейлист не найден"}), 404

        playlist_track = PlaylistTrack.query.filter_by(
            playlist_id=playlist_id,
            track_id=track.id
        ).first()

        if playlist_track:
            db.session.delete(playlist_track)

            if playlist.is_main:
                other_playlists = PlaylistTrack.query.filter_by(track_id=track.id).count()
                if other_playlists == 0:
                    if track.file_path and track.file_path.startswith('https://'):
                        object_key = track.file_path.replace(f"https://{YANDEX_BUCKET}.storage.yandexcloud.net/", "")
                        delete_from_yandex(object_key)
                    db.session.delete(track)
                    print(f"🗑️ Трек полностью удален из системы")

            db.session.commit()
            print(f"✅ Трек удален из плейлиста '{playlist.name}' для {username}")

        return jsonify({"ok": True})

    except Exception as e:
        db.session.rollback()
        print(f"❌ Ошибка: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/delete_playlist', methods=['POST'])
def delete_playlist():
    try:
        data = request.json
        username = data.get('nick')
        playlist_id = data.get('playlist_id')

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404

        playlist = Playlist.query.filter_by(id=playlist_id, user_id=user.id).first()
        if playlist:
            for like in PlaylistLike.query.filter_by(playlist_id=playlist.id).all():
                db.session.delete(like)
            db.session.delete(playlist)
            db.session.commit()

        return jsonify({"ok": True})

    except Exception as e:
        db.session.rollback()
        print(f"❌ Ошибка: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/play_playlist', methods=['POST'])
def play_playlist():
    try:
        data = request.json
        username = data.get('nick')
        playlist_id = data.get('playlist_id')

        user = User.query.filter_by(username=username).first()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404

        playlist = Playlist.query.filter_by(id=playlist_id, user_id=user.id).first()
        if not playlist:
            return jsonify({"error": "Плейлист не найден"}), 404

        playlist_tracks = PlaylistTrack.query.filter_by(
            playlist_id=playlist_id
        ).order_by(PlaylistTrack.order_position).all()

        tracks = []
        for pt in playlist_tracks:
            track = pt.track
            tracks.append({
                'name': track.title,
                'artist': track.artist,
                'url': track.file_path,
                'cover': track.cover_art
            })

        return jsonify({"ok": True, "tracks": tracks})

    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return jsonify({"error": str(e)}), 500


# ========== ДЕБАГ ==========
@app.route('/api/debug/users', methods=['GET'])
def debug_users():
    users = User.query.all()
    result = [{'id': u.id, 'username': u.username, 'created_at': u.created_at} for u in users]
    return jsonify(result)


# ========== ЗАПУСК ==========
if __name__ == "__main__":
    app.run(debug=True, port=5000)
