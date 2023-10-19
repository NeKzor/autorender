// Copyright (c) 2023, NeKz
// SPDX-License-Identifier: MIT

/// <reference lib="dom" />

const minWidthBreakpoints = {
  md: 768,
};

// Navbar

const navItemsLeft = document.getElementById('nav-items-left');
const navBackButton = document.getElementById('nav-back-button');
const navSearchButton = document.getElementById('nav-search-button');
const navSearch = document.getElementById('nav-search');
const navSearchItems = document.getElementById('nav-search-items');
/** @type {HTMLInputElement} */
const navSearchInput = document.getElementById('nav-search-input');
const navSearchInputClearButton = document.getElementById('nav-search-input-clear-button');
const navItemsRight = document.getElementById('nav-items-right');
const themeToggleButton = document.getElementById('theme-toggle-button');
const userMenuButton = document.getElementById('user-menu-button');
const loginButton = document.getElementById('login-button');

const search = {
  isOpen: false,
  open: null,
  close: null,
  input: null,
  clear: null,
  shortcut: null,
};

if (
  navItemsLeft && navSearchButton && navSearch && navSearchItems && navSearchInput && navSearchInputClearButton &&
  navItemsRight && themeToggleButton
) {
  search.open = (options) => {
    if (search.isOpen) {
      return;
    }

    search.isOpen = true;
    navSearchItems.classList.add('w-full');
    navItemsLeft.classList.add('hidden');
    navSearchButton.classList.add('hidden');
    navSearch.classList.remove('hidden');
    navBackButton.classList.remove('hidden');
    themeToggleButton.classList.add('hidden');
    themeToggleButton.classList.remove('inline-flex');
    userMenuButton?.classList?.add('hidden');
    loginButton?.classList?.add('hidden');
    options?.focus && navSearchInput.focus();
    navSearchInput.value?.length && navSearchInputClearButton.classList.remove('hidden');
  };

  search.close = (options) => {
    if (!search.isOpen) {
      return;
    }

    if (location.pathname.startsWith('/search') && window.innerWidth <= minWidthBreakpoints.md && !options?.force) {
      return;
    }

    search.isOpen = false;
    navSearchItems.classList.remove('w-full');
    navItemsLeft.classList.remove('hidden');
    navSearchButton.classList.remove('hidden');
    navBackButton.classList.add('hidden');
    navSearch.classList.add('hidden');
    themeToggleButton.classList.remove('hidden');
    themeToggleButton.classList.add('inline-flex');
    userMenuButton?.classList?.remove('hidden');
    loginButton?.classList?.remove('hidden');
  };

  /** @param {KeyboardEvent} ev */
  search.input = (ev) => {
    const value = ev.target.value ?? '';

    if (value.length) {
      if (ev.key === 'Enter') {
        location.href = `/search?q=${encodeURIComponent(value)}`;
      }

      navSearchInputClearButton.classList.remove('hidden');
    } else {
      navSearchInputClearButton.classList.add('hidden');
    }
  };

  search.clear = () => {
    navSearchInput.value = '';
    navSearchInput.focus();
    navSearchInputClearButton.classList.add('hidden');
  };

  /** @param {KeyboardEvent} ev */
  search.shortcut = (ev) => {
    if (ev.key === 'k' && ev.ctrlKey && navSearchInput !== document.activeElement) {
      ev.preventDefault();
      navSearchInput.focus();
      const length = navSearchInput.value.length;
      navSearchInput.setSelectionRange(length, length);
    } else if (ev.key === 'Escape' && navSearchInput === document.activeElement) {
      ev.preventDefault();
      navSearchInput.blur();
    }
  };

  navSearchButton.addEventListener('click', () => search.open({ focus: true }));
  navSearchInput.addEventListener('focusout', () => search.close());
  navSearchInput.addEventListener('keydown', search.input);
  navBackButton.addEventListener('click', () => search.close({ force: true }));
  navSearchInputClearButton.addEventListener('click', () => search.clear());
  document.addEventListener('keydown', search.shortcut);
}

const darkButton = document.getElementById('theme-toggle-dark-icon');
const lightButton = document.getElementById('theme-toggle-light-icon');

const themeButton = localStorage.getItem('color-theme') === 'dark' ||
    (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ? lightButton
  : darkButton;

themeButton.classList.remove('hidden');

if (themeToggleButton) {
  themeToggleButton.addEventListener('click', () => {
    darkButton.classList.toggle('hidden');
    lightButton.classList.toggle('hidden');

    const colorTheme = localStorage.getItem('color-theme');
    const setDarkMode = (colorTheme && colorTheme !== 'dark') || !document.documentElement.classList.contains('dark');

    document.documentElement.classList[setDarkMode ? 'add' : 'remove']('dark');
    localStorage.setItem('color-theme', setDarkMode ? 'dark' : 'light');
  });
}

// Share Modal

const initShareModal = () => {
  const shareModal = document.getElementById('share-modal');
  if (!shareModal) {
    return;
  }

  /** @type {HTMLInputElement} */
  const shareModalInput = document.getElementById('share-modal-input');
  const shareModalCloseButton = document.getElementById('share-modal-close-button');
  const shareModalCopyButton = document.getElementById('share-modal-copy-button');
  const shareButtons = document.querySelectorAll('.video-share-button');
  /** @type {HTMLInputElement} */
  const shareModalStartAtCheckbox = document.getElementById('share-modal-start-at-checkbox');
  /** @type {HTMLInputElement} */
  const shareModalStartAtInput = document.getElementById('share-modal-start-at-input');
  const shareModalCopyTooltip = document.getElementById('share-modal-copy-tooltip');

  shareButtons.forEach((shareButton) => {
    shareButton.addEventListener('click', (ev) => {
      shareModal.classList.remove('hidden');
      shareModal.classList.add('flex');
      shareModalInput.value = `${location.origin}/videos/${ev.target.id.slice(19)}`;
      shareModalStartAtCheckbox.checked = false;
      shareModalStartAtInput.toggleAttribute('disabled', true);
      shareModalStartAtInput.value = '0:00';
    });
  });

  shareModalCloseButton.addEventListener('click', () => {
    shareModal.classList.add('hidden');
    shareModalInput.value = '';
  });

  class ButtonTooltip extends Tooltip {
    _getTriggerEvents() {
      return {
        showEvents: ['click'],
        hideEvents: [],
      };
    }
  }

  new ButtonTooltip(shareModalCopyTooltip, shareModalCopyButton, {
    placement: 'top',
    triggerType: 'none',
  });

  shareModalCopyButton.addEventListener('click', () => {
    shareModalInput.select();
    navigator.clipboard.writeText(shareModalInput.value);
  });

  shareModalStartAtCheckbox.addEventListener('click', (ev) => {
    shareModalStartAtInput.toggleAttribute('disabled', !ev.target.checked);

    if (!ev.target.checked) {
      const url = new URL(shareModalInput.value);
      url.searchParams.delete('t');
      shareModalInput.value = url.toString();
    }
  });

  const fromTime = (value) => {
    const str = value[0] === '0' && value.length === 2 ? value.substr(1) : value;
    const valueInt = parseInt(str, 10);
    return str === valueInt.toString() ? valueInt : NaN;
  };

  const isTime = (value, max) => !isNaN(value) && value >= 0 && value <= max;

  shareModalStartAtInput.addEventListener('focusout', () => {
    const value = shareModalStartAtInput.value;
    const valueSplit = value.split(':');
    let totalSeconds = 0;

    switch (valueSplit.length) {
      case 3: {
        const [hours, minutes, seconds] = valueSplit.map(fromTime);
        if (!isTime(hours, 99) || !isTime(minutes, 59) || !isTime(seconds, 59)) {
          shareModalStartAtInput.value = '0:00';
          break;
        }
        totalSeconds = (hours * 60 * 60) + (minutes * 60) + seconds;
        shareModalStartAtInput.value = `${hours}:${minutes.toString().padStart(2, '0')}:${
          seconds.toString().padStart(2, '0')
        }`;
        break;
      }
      case 2: {
        const [minutes, seconds] = valueSplit.map(fromTime);
        if (!isTime(minutes, 59) || !isTime(seconds, 59)) {
          shareModalStartAtInput.value = '0:00';
          break;
        }
        totalSeconds = (minutes * 60) + seconds;
        shareModalStartAtInput.value = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        break;
      }
      case 1: {
        totalSeconds = fromTime(value);
        if (isNaN(totalSeconds) || totalSeconds <= 0) {
          shareModalStartAtInput.value = '0:00';
          break;
        }

        const seconds = totalSeconds >= 60 ? totalSeconds % 60 : totalSeconds;
        const totalMinutes = Math.floor(totalSeconds / 60);
        const minutes = totalMinutes >= 60 ? totalMinutes % 60 : totalMinutes;
        const hours = Math.floor(totalMinutes / 60);
        shareModalStartAtInput.value = hours
          ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
          : `${minutes}:${seconds.toString().padStart(2, '0')}`;
        break;
      }
      default: {
        shareModalStartAtInput.value = '0:00';
        break;
      }
    }

    const url = new URL(shareModalInput.value);
    url.searchParams.set('t', totalSeconds);
    shareModalInput.value = url.toString();
  });
};

// Videos

if (location.pathname.startsWith('/videos/') && location.pathname.length === 19) {
  const video = document.querySelector('video');
  //const videoLoadingStatus = document.getElementById('video-loading-status');

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

    video.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    let timestampSet = false;

    video.addEventListener('canplay', () => {
      if (!timestampSet) {
        timestampSet = true;

        const search = new URLSearchParams(location.search);
        const param = search.get('t');
        const time = parseInt(param, 10);

        if (param === time.toString()) {
          video.currentTime = time;
        }
      }
    });

    fetch(`/api/v1${location.pathname}/views`, { method: 'POST' }).catch(console.error);

    initShareModal();
  }

  const retryRenderButton = document.querySelector('#video-retry-render-button');
  if (retryRenderButton) {
    retryRenderButton.addEventListener('click', () => {
      retryRenderButton.setAttribute('disabled', '');

      const [refreshSvg, loadingSvg] = [...retryRenderButton.children];
      refreshSvg.classList.add('hidden');
      loadingSvg.classList.add('inline');
      refreshSvg.classList.remove('inline');
      loadingSvg.classList.remove('hidden');

      fetch(`/api/v1${location.pathname}/rerender`, { method: 'POST' })
        .catch(console.error)
        .finally(() => location.reload());
    });
  }
}

// Search

if (location.pathname.startsWith('/search') && location.search.length !== 0) {
  if (window.innerWidth <= minWidthBreakpoints.md && search.open) {
    search.open();
  }

  initShareModal();
}

// Page Not Found

const goBackButton = document.querySelector('#not-found-go-back');
if (goBackButton) {
  goBackButton.addEventListener('click', () => history.back());
}
