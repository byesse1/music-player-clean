import os
import shutil
import subprocess
from pydub import AudioSegment
from pydub.effects import normalize

os.environ["TORCHAUDIO_USE_TORCHCODEC"] = "0"

def remove_vocals_demucs(input_path, output_path):
    """Удаление вокала через Demucs"""
    try:
        output_dir = os.path.dirname(output_path)
        temp_dir = os.path.join(output_dir, "demucs_temp")
        
        cmd = [
            "demucs",
            "--two-stems", "vocals",
            "-o", temp_dir,
            input_path
        ]
        
        print("🎵 Обработка через Demucs (нейросеть)...")
        print("⏳ Может занять 30-60 секунд, пожалуйста, подождите...")
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"❌ Ошибка Demucs: {result.stderr}")
            return False
        
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        
        possible_paths = [
            os.path.join(temp_dir, "htdemucs", base_name, "no_vocals.wav"),
            os.path.join(temp_dir, "demucs_separated", "htdemucs", base_name, "no_vocals.wav"),
            os.path.join(temp_dir, "separated", "htdemucs", base_name, "no_vocals.wav"),
        ]
        
        instrumental_path = None
        for path in possible_paths:
            if os.path.exists(path):
                instrumental_path = path
                break
        
        if instrumental_path and os.path.exists(instrumental_path):
            audio = AudioSegment.from_wav(instrumental_path)
            audio.export(output_path, format="mp3", bitrate="320k")
            shutil.rmtree(temp_dir, ignore_errors=True)
            print(f"✅ Голос полностью удалён!")
            return True
        else:
            print("❌ Не найден обработанный файл")
            shutil.rmtree(temp_dir, ignore_errors=True)
            return False
            
    except ImportError:
        print("❌ Demucs не установлен. Установите: pip install demucs")
        return False
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return False

def boost_bass(input_path, output_path, boost_db=5):
    """Усиление баса"""
    try:
        audio = AudioSegment.from_file(input_path)
        
        low = audio.low_pass_filter(200)
        high = audio.high_pass_filter(200)
        
        low = low + boost_db
        
        result = low.overlay(high)
        result = normalize(result)
        
        result.export(output_path, format="mp3", bitrate="320k")
        print(f"✅ Бас усилен на {boost_db} дБ!")
        return True
        
    except Exception as e:
        print(f"❌ Ошибка усиления баса: {e}")
        return False

def remove_vocals(input_path, output_path):
    """Основная функция удаления вокала"""
    if remove_vocals_demucs(input_path, output_path):
        return True
    
    print("🔄 Demucs не сработал, пробуем упрощённый метод...")
    return remove_vocals_simple(input_path, output_path)

def remove_vocals_simple(input_path, output_path):
    """Упрощённое удаление вокала"""
    try:
        audio = AudioSegment.from_file(input_path)
        
        if audio.channels == 1:
            audio = audio.set_channels(2)
        
        left = audio.split_to_mono()[0]
        right = audio.split_to_mono()[1]
        
        instrumental = left - right
        instrumental = normalize(instrumental)
        instrumental.export(output_path, format="mp3", bitrate="320k")
        
        print(f"✅ Голос удалён (упрощённый метод)")
        return True
        
    except Exception as e:
        print(f"❌ Ошибка упрощённого метода: {e}")
        return False

def get_audio_duration(file_path):
    """Возвращает длительность аудиофайла в секундах"""
    try:
        audio = AudioSegment.from_file(file_path)
        return int(len(audio) / 1000)
    except Exception as e:
        print(f"Ошибка получения длительности: {e}")
        return 0