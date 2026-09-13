import bgmSrc from '../../地图相关素材/Mossy Barn Loop.mp3';

const audio = new Audio(bgmSrc);
audio.loop = true;
audio.preload = 'auto';
audio.volume = 0.55;

const listeners = new Set();

function emit() {
  const playing = !audio.paused;
  listeners.forEach((listener) => listener(playing));
}

audio.addEventListener('play', emit);
audio.addEventListener('pause', emit);
audio.addEventListener('ended', emit);

function startBackgroundMusic() {
  const result = audio.play();
  if (result && typeof result.catch === 'function') result.catch(() => emit());
  return result;
}

function pauseBackgroundMusic() {
  audio.pause();
}

function toggleBackgroundMusic() {
  return audio.paused ? startBackgroundMusic() : pauseBackgroundMusic();
}

function subscribeBackgroundMusic(listener) {
  listeners.add(listener);
  listener(!audio.paused);
  return () => listeners.delete(listener);
}

function getBackgroundMusicState() {
  return {
    paused: audio.paused,
    currentTime: audio.currentTime,
    duration: audio.duration,
    loop: audio.loop,
    volume: audio.volume,
    src: audio.currentSrc || audio.src,
  };
}

export {
  startBackgroundMusic,
  pauseBackgroundMusic,
  toggleBackgroundMusic,
  subscribeBackgroundMusic,
  getBackgroundMusicState,
};
