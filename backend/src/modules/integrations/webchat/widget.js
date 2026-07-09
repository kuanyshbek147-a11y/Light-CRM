(function () {
  "use strict";

  var SCRIPT =
    document.currentScript ||
    (function () {
      var list = document.getElementsByTagName("script");
      for (var i = list.length - 1; i >= 0; i -= 1) {
        if (list[i].getAttribute("data-widget-id")) {
          return list[i];
        }
      }
      return null;
    })();

  if (!SCRIPT) {
    return;
  }

  var WIDGET_ID = SCRIPT.getAttribute("data-widget-id") || "";
  if (!WIDGET_ID) {
    console.warn("[Light CRM Widget] data-widget-id is required");
    return;
  }

  var API_BASE = (SCRIPT.getAttribute("data-api-base") || SCRIPT.src.replace(/\/widget\.js(?:\?.*)?$/, "")).replace(
    /\/+$/,
    ""
  );
  var STORAGE_KEY = "lightcrm_webchat_" + WIDGET_ID;
  var state = {
    open: false,
    config: null,
    visitorToken: null,
    conversationId: null,
    messages: [],
    sending: false,
    pollTimer: null
  };

  function loadStoredToken() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch (_err) {
      return "";
    }
  }

  function saveToken(token) {
    try {
      localStorage.setItem(STORAGE_KEY, token);
    } catch (_err) {
      /* ignore */
    }
  }

  function api(path, options) {
    return fetch(API_BASE + path, options).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          throw new Error((data && data.error) || "Request failed");
        }
        return data;
      });
    });
  }

  function formatTime(value) {
    try {
      var date = new Date(value);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (_err) {
      return "";
    }
  }

  function ensureSession() {
    var body = { visitorToken: state.visitorToken || loadStoredToken() || undefined };
    return api("/api/integrations/webchat/widget/" + encodeURIComponent(WIDGET_ID) + "/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (data) {
      state.visitorToken = data.visitorToken;
      state.conversationId = data.conversationId;
      state.messages = data.messages || [];
      saveToken(data.visitorToken);
      renderMessages();
      joinSocket();
      return data;
    });
  }

  function refreshMessages() {
    if (!state.visitorToken) {
      return Promise.resolve();
    }
    return api(
      "/api/integrations/webchat/widget/" +
        encodeURIComponent(WIDGET_ID) +
        "/session/" +
        encodeURIComponent(state.visitorToken) +
        "/messages"
    ).then(function (data) {
      state.messages = data.messages || [];
      renderMessages();
    });
  }

  function upsertMessage(message) {
    if (!message || !message.id) {
      return;
    }
    var exists = state.messages.some(function (item) {
      return item.id === message.id;
    });
    if (exists) {
      return;
    }
    state.messages.push(message);
    renderMessages();
  }

  var socket = null;
  function joinSocket() {
    if (!state.visitorToken || typeof window.io !== "function") {
      return;
    }
    if (!socket) {
      socket = window.io(API_BASE, { transports: ["websocket", "polling"] });
      socket.on("webchat:message", function (message) {
        upsertMessage(message);
      });
    }
    socket.emit("webchat:join", { visitorToken: state.visitorToken, widgetId: WIDGET_ID });
  }

  function loadSocketIo() {
    if (typeof window.io === "function") {
      joinSocket();
      return;
    }
    var existing = document.querySelector('script[data-lightcrm-socket="1"]');
    if (existing) {
      existing.addEventListener("load", joinSocket);
      return;
    }
    var script = document.createElement("script");
    script.src = API_BASE + "/socket.io/socket.io.js";
    script.async = true;
    script.setAttribute("data-lightcrm-socket", "1");
    script.onload = joinSocket;
    document.head.appendChild(script);
  }

  function startPolling() {
    if (state.pollTimer) {
      return;
    }
    state.pollTimer = setInterval(function () {
      if (!state.open) {
        return;
      }
      refreshMessages().catch(function () {
        /* ignore */
      });
    }, 4000);
  }

  function cssEscapeColor(color) {
    return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#5b5ce9";
  }

  var host = document.createElement("div");
  host.id = "lightcrm-webchat-root";
  document.body.appendChild(host);
  var shadow = host.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:Segoe UI,system-ui,-apple-system,sans-serif}" +
    ".wrap{position:fixed;right:20px;bottom:20px;z-index:2147483000}" +
    ".bubble{width:58px;height:58px;border:none;border-radius:50%;cursor:pointer;color:#fff;" +
    "box-shadow:0 10px 28px rgba(15,23,42,.28);display:grid;place-items:center;font-size:24px}" +
    ".panel{position:absolute;right:0;bottom:72px;width:min(360px,calc(100vw - 24px));height:480px;" +
    "max-height:calc(100vh - 110px);background:#fff;border-radius:18px;overflow:hidden;" +
    "box-shadow:0 18px 50px rgba(15,23,42,.28);display:none;flex-direction:column;border:1px solid #e8ebf7}" +
    ".panel.open{display:flex}" +
    ".header{padding:14px 16px;color:#fff}" +
    ".headerTitle{font-size:16px;font-weight:700;margin:0}" +
    ".headerHint{margin:4px 0 0;font-size:12px;opacity:.9}" +
    ".messages{flex:1;overflow:auto;padding:14px;background:#f7f8ff;display:flex;flex-direction:column;gap:8px}" +
    ".msg{max-width:82%;padding:9px 11px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-break:break-word}" +
    ".msg.in{align-self:flex-end;background:var(--lc-primary,#5b5ce9);color:#fff;border-bottom-right-radius:4px}" +
    ".msg.out{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;color:#151a2d;border-bottom-left-radius:4px}" +
    ".msgTime{display:block;margin-top:4px;font-size:10px;opacity:.7}" +
    ".greeting{align-self:center;text-align:center;color:#64748b;font-size:13px;padding:8px 12px}" +
    ".composer{display:flex;gap:8px;padding:10px;border-top:1px solid #e8ebf7;background:#fff}" +
    ".composer input{flex:1;border:1px solid #dbe2f0;border-radius:12px;padding:10px 12px;font:inherit;outline:none}" +
    ".composer input:focus{border-color:var(--lc-primary,#5b5ce9)}" +
    ".composer button{border:none;border-radius:12px;padding:0 14px;background:var(--lc-primary,#5b5ce9);color:#fff;font-weight:700;cursor:pointer}" +
    ".composer button:disabled{opacity:.6;cursor:default}";

  var wrap = document.createElement("div");
  wrap.className = "wrap";
  wrap.innerHTML =
    '<div class="panel" part="panel">' +
    '  <div class="header">' +
    '    <p class="headerTitle">Онлайн-чат</p>' +
    '    <p class="headerHint">Обычно отвечаем быстро</p>' +
    "  </div>" +
    '  <div class="messages"></div>' +
    '  <form class="composer">' +
    '    <input type="text" maxlength="4000" placeholder="Напишите сообщение..." autocomplete="off" />' +
    '    <button type="submit">➤</button>' +
    "  </form>" +
    "</div>" +
    '<button type="button" class="bubble" aria-label="Открыть чат">💬</button>';

  shadow.appendChild(style);
  shadow.appendChild(wrap);

  var panel = wrap.querySelector(".panel");
  var bubble = wrap.querySelector(".bubble");
  var messagesEl = wrap.querySelector(".messages");
  var form = wrap.querySelector(".composer");
  var input = wrap.querySelector(".composer input");
  var sendBtn = wrap.querySelector(".composer button");
  var headerTitle = wrap.querySelector(".headerTitle");
  var headerHint = wrap.querySelector(".headerHint");

  function renderMessages() {
    messagesEl.innerHTML = "";
    if (!state.messages.length && state.config && state.config.greeting) {
      var greeting = document.createElement("div");
      greeting.className = "greeting";
      greeting.textContent = state.config.greeting;
      messagesEl.appendChild(greeting);
    }
    state.messages.forEach(function (message) {
      var row = document.createElement("div");
      // visitor messages are "incoming" in CRM, but "out" from visitor UI perspective is manager reply
      var fromVisitor = message.direction === "incoming";
      row.className = "msg " + (fromVisitor ? "in" : "out");
      row.textContent = message.body || "";
      var time = document.createElement("span");
      time.className = "msgTime";
      time.textContent = formatTime(message.created_at);
      row.appendChild(time);
      messagesEl.appendChild(row);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function applyConfig(config) {
    state.config = config;
    var color = cssEscapeColor(config.primaryColor || "#5b5ce9");
    wrap.style.setProperty("--lc-primary", color);
    bubble.style.background = color;
    wrap.querySelector(".header").style.background = color;
    headerTitle.textContent = config.title || "Онлайн-чат";
    headerHint.textContent = "Сообщения приходят в Light CRM";
    renderMessages();
  }

  bubble.addEventListener("click", function () {
    state.open = !state.open;
    panel.classList.toggle("open", state.open);
    if (state.open) {
      ensureSession()
        .then(function () {
          input.focus();
        })
        .catch(function (err) {
          console.warn("[Light CRM Widget]", err);
        });
    }
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (state.sending) {
      return;
    }
    var text = (input.value || "").trim();
    if (!text) {
      return;
    }

    state.sending = true;
    sendBtn.disabled = true;

    ensureSession()
      .then(function () {
        return api(
          "/api/integrations/webchat/widget/" +
            encodeURIComponent(WIDGET_ID) +
            "/session/" +
            encodeURIComponent(state.visitorToken) +
            "/messages",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: text })
          }
        );
      })
      .then(function (data) {
        input.value = "";
        if (data.message) {
          upsertMessage(data.message);
        } else {
          return refreshMessages();
        }
      })
      .catch(function (err) {
        console.warn("[Light CRM Widget] send failed", err);
        alert("Не удалось отправить сообщение. Попробуйте ещё раз.");
      })
      .then(function () {
        state.sending = false;
        sendBtn.disabled = false;
        input.focus();
      });
  });

  api("/api/integrations/webchat/widget/" + encodeURIComponent(WIDGET_ID) + "/config")
    .then(function (config) {
      applyConfig(config);
      loadSocketIo();
      startPolling();
    })
    .catch(function (err) {
      console.warn("[Light CRM Widget] config failed", err);
      host.remove();
    });
})();
