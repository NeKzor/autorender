// Copyright (c) 2023-2024, NeKz
// SPDX-License-Identifier: MIT

/// <reference lib="dom" />

// deno-lint-ignore-file no-window

import 'https://esm.sh/v135/rvfc-polyfill@1.0.7/es2022/rvfc-polyfill.mjs';

const minWidthBreakpoints = {
  md: 768,
};

/** @param {HTMLElement} last */
const initPreviews = (last) => {
  let element = last;

  while (element) {
    const previewImage = element.querySelector('[x-preview]');
    const thumbnail = previewImage?.parentElement?.firstElementChild;

    if (thumbnail) {
      thumbnail.addEventListener(
        'mousemove',
        () => {
          previewImage.src = previewImage.getAttribute('x-preview');
          previewImage.classList.remove('hidden');
        },
        { once: true },
      );
    }

    if (!element.nextElementSibling) {
      return element;
    }

    element = element.nextElementSibling;
  }
};

const initLoadMore = (view) => {
  const videosElement = document.querySelector('[x-last-video]');
  if (!videosElement) {
    return;
  }

  let lastVideoElement = initPreviews(videosElement.firstElementChild);

  const loadMore = document.querySelector('#loading');
  if (!videosElement || !loadMore) {
    return;
  }

  let isLoading = false;
  let lastVideo = videosElement.getAttribute('x-last-video');

  const headers = {
    'Accept': 'text/html',
  };

  const loadMoreVideos = (previous) => {
    if (isLoading) {
      return;
    }

    if (!lastVideo) {
      observer.disconnect();
      return;
    }

    isLoading = true;
    loadMore.firstElementChild?.classList?.remove('hidden');

    const search = new URLSearchParams(`?l=${encodeURIComponent(previous)}`);

    switch (view) {
      case 'search': {
        const query = (new URLSearchParams(location.search)).get('q');
        search.set('q', encodeURIComponent(query));
        break;
      }
      case 'profile': {
        const user = location.pathname.split('/').at(-1);
        search.set('u', encodeURIComponent(user));
        break;
      }
      default: {
        break;
      }
    }

    fetch(`/api/v1/videos/more/${view}?${search}`, { headers })
      .then(async (res) => {
        if (!res.ok) {
          return;
        }

        lastVideo = res.headers.get('X-Last-Video');
        if (!lastVideo) {
          loadMore.textContent = 'No more videos.';
        }

        videosElement.insertAdjacentHTML('beforeend', await res.text());
        lastVideoElement = initPreviews(lastVideoElement);
        initDropdowns();
      })
      .catch(() => void 0)
      .finally(() => {
        isLoading = false;
        loadMore.firstElementChild?.classList?.add('hidden');
      });
  };

  loadMoreVideos(lastVideo);

  const observer = new IntersectionObserver(([entry]) => {
    entry.isIntersecting && loadMoreVideos(lastVideo);
  });

  observer.observe(loadMore);
};

// Home

if (location.pathname === '/') {
  initLoadMore('home');
}

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
const sidebarButton = document.getElementById('sidebar-button');
const defaultSidebar = document.getElementById('default-sidebar');

if (sidebarButton) {
  const main = document.querySelector('main');
  const videos = document.getElementById('videos');

  sidebarButton.addEventListener('click', () => {
    if (window.innerWidth > minWidthBreakpoints.md) {
      if (defaultSidebar.classList.contains('hidden')) {
        // Show
        defaultSidebar.classList.add('lg:translate-x-0');
        defaultSidebar.classList.remove('hidden');

        main.classList.add('lg:ml-60');

        if (videos) {
          videos.className =
            'grid grid-cols gap-x-4 gap-y-8 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';
        }
      } else {
        defaultSidebar.classList.add('hidden');

        main.classList.remove('lg:ml-60');

        if (videos) {
          videos.className =
            'grid grid-cols gap-x-4 gap-y-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';
        }
      }
    }
  });
}

const search = {
  isOpen: false,
  open: null,
  close: null,
  input: null,
  keydown: null,
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

  search.input = (ev) => {
    if ((ev.target.value ?? '').length) {
      navSearchInputClearButton.classList.remove('hidden');
    } else {
      navSearchInputClearButton.classList.add('hidden');
    }
  };

  /** @param {KeyboardEvent} ev */
  search.keydown = (ev) => {
    const value = ev.target.value ?? '';
    if (value.length) {
      if (ev.key === 'Enter') {
        location.href = `/search?q=${encodeURIComponent(value)}`;
      }
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
  navSearchInput.addEventListener('input', search.input);
  navSearchInput.addEventListener('keydown', search.keydown);
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
    document.documentElement.style.setProperty('color-scheme', setDarkMode ? 'dark' : 'light');
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

// Rerender Modal

const initRerenderModal = () => {
  const rerenderModal = document.getElementById('rerender-modal');
  if (!rerenderModal) {
    return;
  }

  /** @type {HTMLInputElement} */
  const rerenderModalCloseButton = document.getElementById('rerender-modal-close-button');
  const rerenderModalQueueButton = document.getElementById('rerender-modal-queue-button');
  /** @type {HTMLInputElement} */
  const rerenderModalRepairCheckbox = document.getElementById('rerender-modal-repair-checkbox');
  const rerenderModalSndRestartCheckbox = document.getElementById('rerender-modal-snd-restart-checkbox');
  const rerenderModalSkipCoopCheckbox = document.getElementById('rerender-modal-skip-coop-checkbox');
  const tryRerenderButton = document.getElementById('video-try-rerender-button');
  const rerenderButton = document.getElementById('video-rerender-button');

  const openModal = () => {
    rerenderModal.classList.remove('hidden');
    rerenderModal.classList.add('flex');

    if (rerenderModalRepairCheckbox) rerenderModalRepairCheckbox.checked = false;
    if (rerenderModalSndRestartCheckbox) rerenderModalSndRestartCheckbox.checked = false;
    if (rerenderModalSkipCoopCheckbox) rerenderModalSkipCoopCheckbox.checked = false;
  };

  tryRerenderButton?.addEventListener('click', openModal);
  rerenderButton?.addEventListener('click', openModal);

  rerenderModalCloseButton?.addEventListener('click', () => {
    rerenderModal.classList.add('hidden');
  });

  rerenderModalQueueButton?.addEventListener('click', () => {
    if (rerenderModalRepairCheckbox) rerenderModalRepairCheckbox.setAttribute('disabled', '');
    if (rerenderModalSndRestartCheckbox) rerenderModalSndRestartCheckbox.setAttribute('disabled', '');
    if (rerenderModalSkipCoopCheckbox) rerenderModalSkipCoopCheckbox.setAttribute('disabled', '');

    rerenderModalQueueButton.setAttribute('disabled', '');
    rerenderModalQueueButton.textContent = 'Adding to queue...';

    fetch(`/api/v1${location.pathname}/rerender`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        demoRepair: rerenderModalRepairCheckbox?.checked ?? false,
        disableSndRestart: rerenderModalSndRestartCheckbox?.checked ?? false,
        disableSkipCoopVideos: rerenderModalSkipCoopCheckbox?.checked ?? false,
      }),
    })
      .finally(() => location.replace(location.href));
  });
};

// Delete Modal

const initDeleteModal = () => {
  const deleteModal = document.getElementById('delete-modal');
  if (!deleteModal) {
    return;
  }

  const deleteModalCloseButton = document.getElementById('delete-modal-close-button');
  const deleteModalDeleteButton = document.getElementById('delete-modal-delete-button');
  /** @type {HTMLInputElement} */
  const deleteReasonBanned = document.getElementById('delete-reason-banned');
  /** @type {HTMLInputElement} */
  const deleteReasonMistake = document.getElementById('delete-reason-mistake');
  /** @type {HTMLInputElement} */
  const deleteReasonDuplicate = document.getElementById('delete-reason-duplicate');
  /** @type {HTMLInputElement} */
  const deleteReasonOther = document.getElementById('delete-reason-other');
  /** @type {HTMLInputElement} */
  const deleteReasonInput = document.getElementById('delete-reason-input');
  const deleteButton = document.getElementById('video-delete-button');

  const onOpen = () => {
    deleteModal.classList.remove('hidden');
    deleteModal.classList.add('flex');
    deleteModalDeleteButton.classList.add('disabled:opacity-75', 'disabled:pointer-events-none');
    deleteModalDeleteButton.setAttribute('disabled', '');
    deleteModalDeleteButton.textContent = 'Delete Video';
    deleteReasonInput.parentElement.classList.add('hidden');
    deleteReasonInput.value = '';
    deleteReasons.forEach((element) => {
      element.removeAttribute('disabled');
      element.checked = false;
    });
    deleteReasonInput.removeAttribute('disabled');
  };

  const onClose = () => {
    deleteModal.classList.add('hidden');
  };

  const deleteReasons = [
    deleteReasonBanned,
    deleteReasonMistake,
    deleteReasonDuplicate,
    deleteReasonOther,
  ];

  const reasonTypes = {
    [deleteReasonBanned.id]: 1,
    [deleteReasonMistake.id]: 2,
    [deleteReasonDuplicate.id]: 3,
    [deleteReasonOther.id]: 4,
  };

  let selectedId = '';

  const onSelect = () => {
    selectedId = deleteReasons.find((element) => element.checked).id;

    if (selectedId === 'delete-reason-other') {
      deleteReasonInput.parentElement.classList.remove('hidden');
      onInput();
    } else {
      deleteReasonInput.parentElement.classList.add('hidden');
      deleteModalDeleteButton.classList.remove('disabled:opacity-75', 'disabled:pointer-events-none');
      deleteModalDeleteButton.removeAttribute('disabled');
    }
  };

  const onInput = () => {
    if (deleteReasonInput.value.trim().length) {
      deleteModalDeleteButton.classList.remove('disabled:opacity-75', 'disabled:pointer-events-none');
      deleteModalDeleteButton.removeAttribute('disabled');
    } else {
      deleteModalDeleteButton.classList.add('disabled:opacity-75', 'disabled:pointer-events-none');
      deleteModalDeleteButton.setAttribute('disabled', '');
    }
  };

  const onSubmit = () => {
    deleteModalDeleteButton.classList.add('disabled:opacity-75', 'disabled:pointer-events-none');
    deleteModalDeleteButton.setAttribute('disabled', '');
    deleteModalDeleteButton.textContent = 'Deleting Video...';
    deleteReasons.forEach((element) => element.setAttribute('disabled', ''));
    deleteReasonInput.setAttribute('disabled', '');

    const reason_type = reasonTypes[selectedId];

    fetch(`/api/v1${location.pathname}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reason: reason_type === 4 ? deleteReasonInput?.value?.trim() ?? null : null,
        reason_type: reason_type,
      }),
    })
      .catch(console.error)
      .finally(() => location.replace(location.href));
  };

  deleteReasonBanned?.addEventListener('click', onSelect);
  deleteReasonMistake?.addEventListener('click', onSelect);
  deleteReasonDuplicate?.addEventListener('click', onSelect);
  deleteReasonOther?.addEventListener('click', onSelect);
  deleteReasonInput?.addEventListener('input', onInput);
  deleteButton?.addEventListener('click', onOpen);
  deleteModalCloseButton?.addEventListener('click', onClose);
  deleteModalDeleteButton?.addEventListener('click', onSubmit);
};

// Videos

if (location.pathname.startsWith('/videos/') && location.pathname.length === 19) {
  const video = document.querySelector('video');

  if (video) {
    const videoVolume = parseFloat(localStorage.getItem('video-volume'));
    if (!isNaN(videoVolume)) {
      video.volume = videoVolume;
    }

    video.muted = localStorage.getItem('video-muted') === 'true';

    video.addEventListener('volumechange', (event) => {
      if (event.target) {
        localStorage.setItem('video-volume', event.target.volume.toString());
        localStorage.setItem('video-muted', event.target.muted.toString());
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

    let btnSize = 50;
    let fontSize = 12;

    const updateSize = () => {
      const height = video.clientHeight;
      btnSize = height / 14.4;
      fontSize = Math.floor(height / 60);
    };

    video.addEventListener('loadedmetadata', updateSize);
    globalThis.addEventListener('resize', updateSize);

    const btnPadding = 2;
    const fps = 60; // TODO: fetch this from video (60 should work for default autorender presets)

    const shouldDraw = document.getElementById('ihud-checkbox');
    /** @type {HTMLCanvasElement} */
    const canvas = document.getElementById('inputs');
    const ctx = canvas.getContext('2d');

    fetch(`/storage/inputs/${location.pathname.slice(location.pathname.lastIndexOf('/') + 1)}`)
      .then((res) => {
        if (!res.ok) {
          return;
        }

        res.arrayBuffer()
          .then((buffer) => {
            const drawButton = (text, column, row, width, height, active) => {
              ctx.fillStyle = active ? 'rgba(255, 255, 255, 1)' : 'rgba(0, 0, 0, 0.5)';
              const rx = btnSize * column + btnPadding * column;
              const ry = btnSize * row + btnPadding * row;
              ctx.fillRect(rx, ry, width, height);

              ctx.fillStyle = 'rgba(255, 255, 255, 1)';
              ctx.font = `${fontSize}px Arial`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.lineWidth = 2;
              ctx.lineJoin = 'round';
              ctx.strokeText(text, rx + width / 2, ry + height / 2);
              ctx.fillText(text, rx + width / 2, ry + height / 2);
            };

            const tickMask = 0b1111_1111_1111_1111_1111;
            const buttonMaskShifted = 0b1111_1111_1111;

            const attack = 0b1;
            const jump = 0b10;
            const duck = 0b100;
            const forward = 0b1000;
            const back = 0b1_0000;
            const use = 0b10_0000;
            const moveleft = 0b10_0000_0000;
            const moveright = 0b100_0000_0000;
            const attack2 = 0b1000_0000_0000;

            let previousTick = 0;
            let previousIndex = 0;

            const version = new DataView(buffer).getUint8(0);
            if (version !== 1) {
              return;
            }

            const inputData = new Uint32Array(buffer.slice(4));

            const drawInputs = (_, metadata) => {
              canvas.width = (btnSize + btnPadding) * 6;
              canvas.height = (btnSize + btnPadding) * 3;

              ctx.clearRect(0, 0, canvas.width, canvas.height);

              if (!shouldDraw.checked) {
                video.requestVideoFrameCallback(drawInputs);
                return;
              }

              const frame = Math.round(metadata.mediaTime * fps);
              const lastFrame = Math.round(video.duration * fps);
              const lastTick = inputData.at(-1) & tickMask;
              const offset = lastTick - lastFrame;
              const tick = frame + offset + 3;

              if (previousTick < tick) {
                previousIndex = 0;
              }

              let index = -1;

              for (let i = previousIndex; i < inputData.length; ++i) {
                if ((inputData[i] & tickMask) === tick) {
                  index = i;
                  break;
                }
              }

              const input = inputData[index];
              const buttons = input ? (input >> 20) & buttonMaskShifted : 0;

              previousIndex = index !== -1 && tick >= previousTick ? index : previousIndex;
              previousTick = tick;

              drawButton('W', 2, 0, btnSize, btnSize, buttons & forward);
              drawButton('E', 3, 0, btnSize, btnSize, buttons & use);
              drawButton('A', 1, 1, btnSize, btnSize, buttons & moveleft);
              drawButton('S', 2, 1, btnSize, btnSize, buttons & back);
              drawButton('D', 3, 1, btnSize, btnSize, buttons & moveright);
              drawButton('C', 0, 2, btnSize, btnSize, buttons & duck);
              drawButton('S', 1, 2, btnSize * 3 + btnPadding * 2, btnSize, buttons & jump);
              drawButton('L', 4, 2, btnSize, btnSize, buttons & attack);
              drawButton('R', 5, 2, btnSize, btnSize, buttons & attack2);

              video.requestVideoFrameCallback(drawInputs);
            };

            video.requestVideoFrameCallback(drawInputs);
          })
          .catch(console.error);
      })
      .catch(console.error);

    fetch(`/api/v1${location.pathname}/views`, { method: 'POST' });

    initShareModal();
    initDeleteModal();
  }

  initRerenderModal();
}

// Search

if (location.pathname.startsWith('/search') && location.search.length !== 0) {
  if (window.innerWidth <= minWidthBreakpoints.md && search.open) {
    search.open();
  }

  initLoadMore('search');
  initShareModal();
}

// Page Not Found

const goBackButton = document.getElementById('not-found-go-back');
if (goBackButton) {
  goBackButton.addEventListener('click', () => history.back());
}

// Profile

if (location.pathname.startsWith('/profile/')) {
  initLoadMore('profile');
}
