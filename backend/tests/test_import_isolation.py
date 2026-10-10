from backend.api.v1.youtube import _task_download_dir
from backend.pipeline.quality import profile_for


def test_each_import_gets_its_own_temp_folder(tmp_path):
    a = _task_download_dir(tmp_path, "task-a")
    b = _task_download_dir(tmp_path, "task-b")
    assert a != b and a.exists() and b.exists()


def test_one_hour_video_keeps_at_least_six_clips_in_auto_mode():
    assert profile_for(3600).min_keep >= 6


def test_two_hour_video_keeps_at_least_twelve_clips():
    assert profile_for(7200).min_keep >= 12
