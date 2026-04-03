use std::cell::RefCell;
use tauri::{AppHandle, Manager};

use log;
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};

struct AudioState {
  _stream: OutputStream,
  stream_handle: OutputStreamHandle,
  sink: Option<Sink>,
}

thread_local! {
  static AUDIO_STATE: RefCell<Option<AudioState>> = RefCell::new(None);
}

static SOUND_RESOURCES: &[(&str, &str)] = &[
  ("chatFinish", "sounds/chat-finish.mp3"),
  ("chatPermission", "sounds/chat-permission.mp3"),
];

fn get_sound_path(key: &str) -> Option<&'static str> {
  SOUND_RESOURCES
    .iter()
    .find(|(k, _)| *k == key)
    .map(|(_, path)| *path)
}

#[tauri::command]
pub fn play_sound(app_handle: AppHandle, sound_key: String) -> Result<(), String> {
  let path = get_sound_path(&sound_key)
    .ok_or_else(|| format!("Unknown sound key: {}", sound_key))?;

  let resource_path = app_handle
    .path()
    .resource_dir()
    .map_err(|e| format!("Failed to get resource dir: {}", e))?
    .join(path);

  if !resource_path.exists() {
    let err = format!("Sound file not found: {}", resource_path.display());
    eprintln!("[audio] Error: {}", err);
    return Err(err);
  }

  play_sound_rodio(&resource_path)?;
  Ok(())
}

pub fn init_audio() -> Result<(), String> {
  AUDIO_STATE.with(|state| {
    let mut state_borrow = state.borrow_mut();
    if state_borrow.is_some() {
      return Ok(());
    }

    let (stream, stream_handle) = match OutputStream::try_default() {
      Ok((stream, stream_handle)) => (stream, stream_handle),
      Err(e) => {
        eprintln!("[audio] Failed to create OutputStream: {}", e);
        return Err(format!("Failed to create audio stream: {}", e));
      }
    };

    let sink = match Sink::try_new(&stream_handle) {
      Ok(sink) => sink,
      Err(e) => {
        return Err(format!("Failed to create sink: {}", e));
      }
    };

    *state_borrow = Some(AudioState {
      _stream: stream,
      stream_handle,
      sink: Some(sink),
    });

    Ok(())
  })
}

fn play_sound_rodio(path: &std::path::Path) -> Result<(), String> {
  AUDIO_STATE.with(|state| {
    let mut state_borrow = state.borrow_mut();

    if state_borrow.is_none() {
      log::info!("Initializing audio system...");
      let (stream, stream_handle) = match OutputStream::try_default() {
        Ok((stream, stream_handle)) => (stream, stream_handle),
        Err(e) => {
          log::warn!("Failed to create audio OutputStream: {}", e);
          return Err(format!("Failed to create audio stream: {}", e));
        }
      };
      let sink = match Sink::try_new(&stream_handle) {
        Ok(sink) => sink,
        Err(e) => {
          log::warn!("Failed to create audio Sink: {}", e);
          return Err(format!("Failed to create sink: {}", e));
        }
      };
      *state_borrow = Some(AudioState {
        _stream: stream,
        stream_handle,
        sink: Some(sink),
      });
    }

    let state = state_borrow.as_mut().ok_or("Audio state not initialized")?;

    if let Some(sink) = &state.sink {
      sink.stop();
    }

    let file = std::fs::File::open(path)
      .map_err(|e| format!("Failed to open sound file: {}", e))?;
    let source = Decoder::new(file)
      .map_err(|e| format!("Failed to decode audio: {}", e))?;

    let new_sink = Sink::try_new(&state.stream_handle)
      .map_err(|e| format!("Failed to create sink: {}", e))?;
    new_sink.append(source);
    new_sink.play();

    state.sink = Some(new_sink);

    Ok(())
  })
}
