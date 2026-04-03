mod audio;

#[cfg(not(mobile))]
mod desktop;

#[cfg(mobile)]
mod mobile;

#[cfg(not(mobile))]
pub use desktop::run;

#[cfg(mobile)]
pub use mobile::run;
