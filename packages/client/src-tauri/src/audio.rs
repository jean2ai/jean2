use std::cell::RefCell;
use tauri::{AppHandle, Manager};

#[cfg(not(target_os = "ios"))]
use log;
#[cfg(not(target_os = "ios"))]
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};

#[cfg(not(target_os = "ios"))]
struct AudioState {
  _stream: OutputStream,
  stream_handle: OutputStreamHandle,
  sink: Option<Sink>,
}

#[cfg(not(target_os = "ios"))]
thread_local! {
  static AUDIO_STATE: RefCell<Option<AudioState>> = RefCell::new(None);
}

#[cfg(target_os = "ios")]
thread_local! {
  static AUDIO_PLAYER: RefCell<Option<*mut objc::runtime::Object>> = RefCell::new(None);
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

  #[cfg(not(target_os = "ios"))]
  {
    match play_sound_rodio(&resource_path) {
      Ok(()) => Ok(()),
      Err(e) => Err(e),
    }?;
  }

  #[cfg(target_os = "ios")]
  {
    play_sound_ios(&resource_path)?;
  }

  Ok(())
}

#[cfg(not(target_os = "ios"))]
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

#[cfg(not(target_os = "ios"))]
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

#[cfg(target_os = "ios")]
#[macro_use]
mod ios_audio {
  use super::*;
  use std::ffi::CString;
  use objc::rc::autoreleasepool;
  use objc::{class, msg_send, sel, sel_impl};

  type Object = objc::runtime::Object;

  extern "C" {
    static AVAudioSessionCategoryPlayback: *const Object;
  }

  #[link(name = "AVFoundation", kind = "framework")]
  extern "C" {}

  fn get_error_description(error: *mut Object) -> String {
    if error.is_null() {
      return "Unknown error".to_string();
    }
    unsafe {
      let description: *mut Object = msg_send![error, localizedDescription];
      if description.is_null() {
        return "Error without description".to_string();
      }
      let description: *const std::ffi::c_char = msg_send![description, UTF8String];
      if description.is_null() {
        return "Failed to get error description".to_string();
      }
      std::ffi::CStr::from_ptr(description)
        .to_string_lossy()
        .into_owned()
    }
  }

  pub fn play_sound_ios(path: &std::path::Path) -> Result<(), String> {
    let old_player: Option<*mut Object> = AUDIO_PLAYER.with(|player_cell: &RefCell<Option<*mut Object>>| {
      player_cell.borrow_mut().take()
    });

    let c_string = CString::new(path.to_string_lossy().as_bytes())
      .map_err(|e| format!("Invalid path: {}", e))?;

    let result = autoreleasepool(|| {
      let audio_session: *mut Object = unsafe { msg_send![class!(AVAudioSession), sharedInstance] };

      if audio_session.is_null() {
        return Err("Failed to get AVAudioSession".to_string());
      }

      let mut error: *mut Object = std::ptr::null_mut();
      let set_category: bool = unsafe {
        msg_send![audio_session, setCategory:AVAudioSessionCategoryPlayback error:&mut error]
      };

      if !set_category {
        let err_desc = get_error_description(error);
        return Err(format!("Failed to set audio session category: {}", err_desc));
      }

      error = std::ptr::null_mut();
      let activated: bool = unsafe {
        msg_send![audio_session, setActive:true options:0 error:&mut error]
      };

      if !activated {
        let err_desc = get_error_description(error);
        return Err(format!("Failed to activate audio session: {}", err_desc));
      }

      let ns_path: *mut Object = unsafe {
        msg_send![class!(NSString), stringWithUTF8String:c_string.as_ptr()]
      };

      if ns_path.is_null() {
        return Err("Failed to create NSString from path".to_string());
      }

      let file_url: *mut Object = unsafe {
        msg_send![class!(NSURL), fileURLWithPath:ns_path]
      };

      if file_url.is_null() {
        return Err("Failed to create NSURL".to_string());
      }

      let player: *mut Object = unsafe {
        msg_send![class!(AVAudioPlayer), alloc]
      };

      if player.is_null() {
        return Err("Failed to allocate AVAudioPlayer".to_string());
      }

      let mut init_error: *mut Object = std::ptr::null_mut();
      let player: *mut Object = unsafe {
        msg_send![player, initWithContentsOfURL:file_url error:&mut init_error]
      };

      if player.is_null() {
        let err_desc = get_error_description(init_error);
        return Err(format!("Failed to create AVAudioPlayer: {}", err_desc));
      }

      let prepared: bool = unsafe { msg_send![player, prepareToPlay] };

      if !prepared {
        return Err("AVAudioPlayer failed to prepare".to_string());
      }

      let playing: bool = unsafe { msg_send![player, play] };

      if !playing {
        return Err("AVAudioPlayer failed to start playback".to_string());
      }

      *player_cell.borrow_mut() = Some(player);

      Ok(())
    });

    if let Some(old_player) = old_player {
      if !old_player.is_null() {
        unsafe {
          let _: () = msg_send![old_player, stop];
          let _: () = msg_send![old_player, release];
        }
      }
    }

    result
  }
}

#[cfg(target_os = "ios")]
fn play_sound_ios(path: &std::path::Path) -> Result<(), String> {
  ios_audio::play_sound_ios(path)
}
