from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


# Таблица пользователей
class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    #email = db.Column(db.String(120), unique=True, nullable=True)
    password_hash = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Связь с треками пользователя
    tracks = db.relationship('UserTrack', backref='user', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


# Таблица треков (общая библиотека треков)
class Track(db.Model):
    __tablename__ = 'tracks'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    artist = db.Column(db.String(100))
    album = db.Column(db.String(100))
    duration = db.Column(db.Integer)  # длительность в секундах
    file_path = db.Column(db.String(500), nullable=False)  # путь к файлу на сервере
    cover_art = db.Column(db.String(500))  # путь к обложке
    youtube_id = db.Column(db.String(50))  # ID видео с YouTube
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Связь с пользовательскими треками
    user_tracks = db.relationship('UserTrack', backref='track', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'artist': self.artist,
            'album': self.album,
            'duration': self.duration,
            'file_path': self.file_path,
            'cover_art': self.cover_art,
            'youtube_id': self.youtube_id,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


# Таблица связи пользователей с треками (плейлист пользователя)
class UserTrack(db.Model):
    __tablename__ = 'user_tracks'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    track_id = db.Column(db.Integer, db.ForeignKey('tracks.id'), nullable=False)
    added_at = db.Column(db.DateTime, default=datetime.utcnow)
    order_position = db.Column(db.Integer, default=0)  # позиция в плейлисте

    __table_args__ = (
        db.UniqueConstraint('user_id', 'track_id', name='unique_user_track'),
    )

    def to_dict(self):
        track = Track.query.get(self.track_id)
        return {
            'id': self.id,
            'name': track.title if track else 'Unknown',
            'artist': track.artist if track else 'Unknown',
            'url': track.file_path if track else '',
            'cover': track.cover_art if track else None,
            'duration': track.duration if track else 0,
            'added_at': self.added_at.isoformat() if self.added_at else None
        }



# Таблица для обложек треков
class TrackCover(db.Model):
    __tablename__ = 'track_covers'

    id = db.Column(db.Integer, primary_key=True)
    track_url = db.Column(db.String(500), nullable=False)
    cover_path = db.Column(db.String(500), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    cover_art = db.Column(db.String(500), nullable=True)

    # Уникальный индекс для track_url
    __table_args__ = (
        db.UniqueConstraint('track_url', name='unique_track_url'),
    )


# Таблица плейлистов
# Таблица плейлистов
class Playlist(db.Model):
    __tablename__ = 'playlists'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(500))
    cover_art = db.Column(db.String(500))
    is_main = db.Column(db.Boolean, default=False)  # <-- НОВОЕ ПОЛЕ
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref='playlists')
    playlist_tracks = db.relationship('PlaylistTrack', backref='playlist', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        tracks = [pt.track.to_dict() for pt in self.playlist_tracks]
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'cover_art': self.cover_art,
            'is_main': self.is_main,
            'user_id': self.user_id,
            'track_count': len(tracks),
            'tracks': tracks,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

# Таблица связи плейлистов с треками
# Таблица связи плейлистов с треками
class PlaylistTrack(db.Model):
    __tablename__ = 'playlist_tracks'

    id = db.Column(db.Integer, primary_key=True)
    playlist_id = db.Column(db.Integer, db.ForeignKey('playlists.id'), nullable=False)
    track_id = db.Column(db.Integer, db.ForeignKey('tracks.id'), nullable=False)
    order_position = db.Column(db.Integer, default=0)
    added_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('playlist_id', 'track_id', name='unique_playlist_track'),
    )

    track = db.relationship('Track')


class Friendship(db.Model):
    __tablename__ = 'friendships'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    friend_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'friend_id', name='unique_friendship'),
    )

    friend = db.relationship('User', foreign_keys=[friend_id])


class FriendInvite(db.Model):
    __tablename__ = 'friend_invites'

    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(64), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User')


class PlaylistLike(db.Model):
    __tablename__ = 'playlist_likes'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    playlist_id = db.Column(db.Integer, db.ForeignKey('playlists.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'playlist_id', name='unique_playlist_like'),
    )

    user = db.relationship('User')
    playlist = db.relationship('Playlist', backref='likes')
