// Copyright (c) 2023-2025, NeKz
// SPDX-License-Identifier: MIT

/// <reference lib="dom" />

(() => {
  let ws, to, iv = null;
  const hotReload = () => {
    ws?.close();
    ws = new WebSocket(location.origin.replace('http', 'ws') + '/connect/__hot_reload');
    ws.onopen = () => iv = setInterval(() => ws.send('reload?'), 500);
    ws.onmessage = (event) => event.data === 'yes' && location.reload();
    ws.onclose = () => clearInterval(iv) || clearTimeout(to) || (to = setTimeout(() => hotReload(), 500));
  };
  hotReload();
})();
