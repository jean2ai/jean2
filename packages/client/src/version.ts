declare const __CLIENT_VERSION__: string;

export const CLIENT_VERSION: string = typeof __CLIENT_VERSION__ !== 'undefined'
  ? __CLIENT_VERSION__
  : '0.0.0-dev';
