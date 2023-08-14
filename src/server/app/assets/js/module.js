// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

/// <reference lib="dom" />

// Navbar

const darkButton = document.getElementById('theme-toggle-dark-icon');
const lightButton = document.getElementById('theme-toggle-light-icon');

const themeButton = localStorage.getItem('color-theme') === 'dark' ||
    (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ? lightButton
  : darkButton;

themeButton.classList.remove('hidden');

const toggle = document.getElementById('theme-toggle');
if (toggle) {
  toggle.addEventListener('click', () => {
    darkButton.classList.toggle('hidden');
    lightButton.classList.toggle('hidden');

    const colorTheme = localStorage.getItem('color-theme');
    const setDarkMode = (colorTheme && colorTheme !== 'dark') || !document.documentElement.classList.contains('dark');

    document.documentElement.classList[setDarkMode ? 'add' : 'remove']('dark');
    localStorage.setItem('color-theme', setDarkMode ? 'dark' : 'light');
  });
}

// Videos

if (location.pathname.startsWith('/videos/') && location.pathname.length === 19) {
  await fetch(`/api/v1${location.pathname}/views`, { method: 'POST' });

  const video = document.querySelector('video');
  if (video) {
    const videoVolume = parseFloat(localStorage.getItem('video-volume'));
    if (!isNaN(videoVolume)) {
      video.volume = videoVolume;
    }

    video.addEventListener('volumechange', (event) => {
      if (event.target) {
        localStorage.setItem('video-volume', event.target.volume.toString());
      }
    });
  }
}

// Page Not Found

const notFoundGoBack = document.querySelector('#not-found-go-back');
if (notFoundGoBack) {
  notFoundGoBack.addEventListener('click', () => history.back());
}
