"use strict";

/*
 * WikiChat
 * Main application script
 *
 * This file handles:
 * - Wikipedia search
 * - Search history
 * - Saved articles
 * - Themes
 * - Language selection
 * - Article reader
 * - Related articles
 * - Sharing and copying
 * - Matrix background
 * - WikiChat X tools
 */

const state = {
    history: [],
    bookmarks: [],
    currentArticle: null,
    currentQuery: "",
    theme: "dark",
    language: "en"
};

const elements = {
    chat: document.querySelector("#chat"),
    input: document.querySelector("#input"),
    form: document.querySelector("#form"),
    suggestions: document.querySelector("#suggestions"),
    history: document.querySelector("#history"),
    bookmarksButton: document.querySelector("#bookmarksBtn"),
    clearHistoryButton: document.querySelector("#clearHistory"),
    themeButton: document.querySelector("#themeBtn"),
    language: document.querySelector("#language"),
    matrixCanvas: document.querySelector("#matrixCanvas"),
    newChatButton: document.querySelector("#newChat"),
    aboutButton: document.querySelector("#aboutBtn")
};


/* =========================================================
   STORAGE
   ========================================================= */

function loadStorage() {
    try {
        state.history = JSON.parse(
            localStorage.getItem("wikichat_history") || "[]"
        );

        state.bookmarks = JSON.parse(
            localStorage.getItem("wikichat_bookmarks") || "[]"
        );

        state.theme =
            localStorage.getItem("wikichat_theme") || "dark";

        state.language =
            localStorage.getItem("wikichat_language") || "en";
    } catch (error) {
        console.error("Could not load saved data:", error);

        state.history = [];
        state.bookmarks = [];
        state.theme = "dark";
        state.language = "en";
    }

    applyTheme();
    renderHistory();
}


/* =========================================================
   STORAGE HELPERS
   ========================================================= */

function saveHistory() {
    localStorage.setItem(
        "wikichat_history",
        JSON.stringify(state.history)
    );
}

function saveBookmarks() {
    localStorage.setItem(
        "wikichat_bookmarks",
        JSON.stringify(state.bookmarks)
    );
}

function addHistory(query, title) {
    const item = {
        query,
        title,
        date: Date.now()
    };

    state.history = state.history.filter(
        entry => entry.query.toLowerCase() !== query.toLowerCase()
    );

    state.history.unshift(item);

    if (state.history.length > 50) {
        state.history = state.history.slice(0, 50);
    }

    saveHistory();
    renderHistory();
}

function addBookmark(article) {
    if (!article || !article.title) {
        return;
    }

    const alreadySaved = state.bookmarks.some(
        item => item.title === article.title
    );

    if (alreadySaved) {
        return;
    }

    state.bookmarks.unshift({
        title: article.title,
        extract: article.extract || "",
        thumbnail: article.thumbnail || "",
        url: article.url || ""
    });

    saveBookmarks();
}

function removeBookmark(title) {
    state.bookmarks = state.bookmarks.filter(
        item => item.title !== title
    );

    saveBookmarks();
}


/* =========================================================
   THEME
   ========================================================= */

function applyTheme() {
    document.documentElement.dataset.theme =
        state.theme === "light" ? "light" : "dark";

    if (elements.themeButton) {
        elements.themeButton.textContent =
            state.theme === "light" ? "🌙" : "☀";
    }
}

function toggleTheme() {
    state.theme =
        state.theme === "dark" ? "light" : "dark";

    localStorage.setItem(
        "wikichat_theme",
        state.theme
    );

    applyTheme();
}


/* =========================================================
   LANGUAGE
   ========================================================= */

function updateLanguage() {
    if (!elements.language) {
        return;
    }

    state.language = elements.language.value || "en";

    localStorage.setItem(
        "wikichat_language",
        state.language
    );
}


/* =========================================================
   HISTORY UI
   ========================================================= */

function renderHistory() {
    if (!elements.history) {
        return;
    }

    elements.history.innerHTML = "";

    if (state.history.length === 0) {
        const empty = document.createElement("div");

        empty.className = "history-empty";
        empty.textContent = "No searches yet.";

        elements.history.appendChild(empty);
        return;
    }

    state.history.forEach(item => {
        const button = document.createElement("button");

        button.className = "history-item";
        button.type = "button";
        button.textContent = item.query || item.title;

        button.addEventListener("click", () => {
            search(item.query || item.title);
        });

        elements.history.appendChild(button);
    });
}

function clearHistory() {
    state.history = [];

    saveHistory();
    renderHistory();
}


/* =========================================================
   CHAT UI
   ========================================================= */

function addMessage(type, content) {
    if (!elements.chat) {
        return null;
    }

    const message = document.createElement("div");

    message.className = `message ${type}`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";

    avatar.textContent =
        type === "user" ? "YOU" : "W";

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (typeof content === "string") {
        bubble.innerHTML = content;
    } else {
        bubble.appendChild(content);
    }

    message.appendChild(avatar);
    message.appendChild(bubble);

    elements.chat.appendChild(message);

    scrollToBottom();

    return message;
}

function addUserMessage(text) {
    const safeText = escapeHTML(text);

    return addMessage(
        "user",
        `<div>${safeText}</div>`
    );
}

function addAssistantMessage(html) {
    return addMessage("assistant", html);
}

function addLoadingMessage() {
    return addAssistantMessage(`
        <div class="loading">
            <span></span>
            <span></span>
            <span></span>
            <strong>Searching Wikipedia...</strong>
        </div>
    `);
}

function removeMessage(message) {
    if (message && message.parentNode) {
        message.parentNode.removeChild(message);
    }
}

function scrollToBottom() {
    window.requestAnimationFrame(() => {
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth"
        });
    });
}


/* =========================================================
   HTML SAFETY
   ========================================================= */

function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   WIKIPEDIA API
   ========================================================= */

async function wikipediaRequest(params) {
    const url = new URL(
        "https://en.wikipedia.org/w/api.php"
    );

    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    url.searchParams.set("origin", "*");

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Wikipedia request failed: ${response.status}`
        );
    }

    return response.json();
}

async function searchWikipedia(query) {
    const data = await wikipediaRequest({
        action: "query",
        list: "search",
        srsearch: query,
        srlimit: "8",
        format: "json"
    });

    return data.query?.search || [];
}

async function getWikipediaArticle(title) {
    const data = await wikipediaRequest({
        action: "query",
        prop: "extracts|pageimages|info",
        exintro: "1",
        explaintext: "1",
        piprop: "thumbnail",
        pithumbsize: "500",
        inprop: "url",
        titles: title,
        format: "json"
    });

    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0];

    if (!page || page.missing !== undefined) {
        return null;
    }

    return {
        title: page.title || title,
        extract: page.extract || "No description available.",
        thumbnail: page.thumbnail?.source || "",
        url:
            page.fullurl ||
            `https://en.wikipedia.org/wiki/${encodeURIComponent(
                page.title
            )}`
    };
}

async function getRelatedArticles(title) {
    const data = await wikipediaRequest({
        action: "query",
        prop: "links",
        titles: title,
        pllimit: "20",
        plnamespace: "0",
        format: "json"
    });

    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0];

    if (!page || !page.links) {
        return [];
    }

    return page.links
        .map(link => link.title)
        .filter(Boolean)
        .slice(0, 12);
}


/* =========================================================
   SEARCH
   ========================================================= */

async function search(query) {
    query = String(query || "").trim();

    if (!query) {
        return;
    }

    state.currentQuery = query;

    if (elements.input) {
        elements.input.value = query;
    }

    hideSuggestions();

    addUserMessage(query);

    const loading = addLoadingMessage();

    try {
        const results = await searchWikipedia(query);

        if (!results.length) {
            removeMessage(loading);

            addAssistantMessage(`
                <div class="error-message">
                    <strong>No results found.</strong>
                    <p>
                        Try another search term or use a more specific topic.
                    </p>
                </div>
            `);

            return;
        }

        const firstResult = results[0];

        const article = await getWikipediaArticle(
            firstResult.title
        );

        if (!article) {
            removeMessage(loading);

            addAssistantMessage(`
                <div class="error-message">
                    <strong>Article unavailable.</strong>
                    <p>
                        Wikipedia returned a result, but the article
                        could not be loaded.
                    </p>
                </div>
            `);

            return;
        }

        const related = await getRelatedArticles(
            article.title
        );

        state.currentArticle = article;

        addHistory(query, article.title);

        removeMessage(loading);

        addAssistantMessage(
            createArticleCard(article, related)
        );

    } catch (error) {
        console.error("Search error:", error);

        removeMessage(loading);

        addAssistantMessage(`
            <div class="error-message">
                <strong>⚠ Search failed.</strong>
                <p>
                    I couldn't connect to Wikipedia right now.
                    Please check your internet connection and try again.
                </p>

                <button
                    class="btn primary"
                    data-action="retry-search"
                    data-query="${escapeHTML(query)}">
                    ↻ Retry
                </button>
            </div>
        `);
    }
}


/* =========================================================
   ARTICLE CARD
   ========================================================= */

function createArticleCard(article, related) {
    const card = document.createElement("article");

    card.className = "result-card";

    const imageHTML = article.thumbnail
        ? `
            <img
                class="thumb"
                src="${escapeHTML(article.thumbnail)}"
                alt="${escapeHTML(article.title)}"
                loading="lazy">
        `
        : `
            <div class="thumb">
                <span>W</span>
            </div>
        `;

    const relatedHTML = related.length
        ? `
            <div class="related">
                <h3>Related articles</h3>

                <div class="related-grid">
                    ${related
                        .map(title => `
                            <button
                                class="btn related-btn"
                                type="button"
                                data-title="${escapeHTML(title)}">
                                ${escapeHTML(title)}
                            </button>
                        `)
                        .join("")}
                </div>
            </div>
        `
        : "";

    card.innerHTML = `
        <div class="result-head">
            ${imageHTML}

            <div class="result-meta">
                <h2>${escapeHTML(article.title)}</h2>

                <div class="desc">
                    Wikipedia article
                </div>

                <div class="extract">
                    ${formatText(article.extract)}
                </div>
            </div>
        </div>

        <div class="actions">
            <button
                class="btn primary"
                type="button"
                data-action="read"
                data-title="${escapeHTML(article.title)}">
                📖 Read article
            </button>

            <a
                class="btn"
                href="${escapeHTML(article.url)}"
                target="_blank"
                rel="noopener noreferrer">
                Wikipedia ↗
            </a>

            <button
                class="btn"
                type="button"
                data-action="bookmark"
                data-title="${escapeHTML(article.title)}">
                ⭐ Save
            </button>

            <button
                class="btn"
                type="button"
                data-action="copy"
                data-title="${escapeHTML(article.title)}">
                📋 Copy
            </button>

            <button
                class="btn"
                type="button"
                data-action="share"
                data-title="${escapeHTML(article.title)}">
                🔗 Share
            </button>
        </div>

        ${relatedHTML}
    `;

    return card;
}

function formatText(text) {
    const safe = escapeHTML(text);

    return safe
        .replace(/\n\n+/g, "</p><p>")
        .replace(/\n/g, "<br>");
}


/* =========================================================
   ARTICLE READER
   ========================================================= */

async function openReader(title) {
    const article = await getWikipediaArticle(title);

    if (!article) {
        addAssistantMessage(`
            <div class="error-message">
                Article could not be loaded.
            </div>
        `);

        return;
    }

    const reader = document.createElement("div");

    reader.className = "reader-overlay";

    reader.innerHTML = `
        <div class="reader-panel">

            <div class="reader-header">
                <h2>${escapeHTML(article.title)}</h2>

                <button
                    class="icon-btn"
                    type="button"
                    data-action="close-reader"
                    aria-label="Close reader">
                    ✕
                </button>
            </div>

            ${
                article.thumbnail
                    ? `
                        <img
                            class="reader-image"
                            src="${escapeHTML(article.thumbnail)}"
                            alt="${escapeHTML(article.title)}">
                    `
                    : ""
            }

            <div class="reader-content">
                <p>${formatText(article.extract)}</p>

                <a
                    class="btn primary"
                    href="${escapeHTML(article.url)}"
                    target="_blank"
                    rel="noopener noreferrer">
                    Open full Wikipedia article ↗
                </a>
            </div>

        </div>
    `;

    document.body.appendChild(reader);

    document.body.classList.add("reader-open");
}


/* =========================================================
   BOOKMARKS
   ========================================================= */

function showBookmarks() {
    if (!state.bookmarks.length) {
        addAssistantMessage(`
            <div class="empty-state">
                <strong>No saved articles.</strong>
                <p>
                    Use the ⭐ Save button on an article to save it here.
                </p>
            </div>
        `);

        return;
    }

    const container = document.createElement("div");

    container.className = "bookmarks-panel";

    container.innerHTML = `
        <div class="panel-title">
            <h2>⭐ Saved articles</h2>
        </div>

        <div class="bookmark-grid">
            ${state.bookmarks
                .map(article => `
                    <article class="bookmark-card">
                        <h3>
                            ${escapeHTML(article.title)}
                        </h3>

                        <p>
                            ${escapeHTML(
                                article.extract.slice(0, 180)
                            )}
                        </p>

                        <div class="actions">
                            <button
                                class="btn primary"
                                type="button"
                                data-action="read"
                                data-title="${escapeHTML(
                                    article.title
                                )}">
                                Read
                            </button>

                            <button
                                class="btn"
                                type="button"
                                data-action="remove-bookmark"
                                data-title="${escapeHTML(
                                    article.title
                                )}">
                                Remove
                            </button>
                        </div>
                    </article>
                `)
                .join("")}
        </div>
    `;

    addAssistantMessage(container);
}


/* =========================================================
   COPY / SHARE
   ========================================================= */

async function copyArticle(title) {
    const article = await getWikipediaArticle(title);

    if (!article) {
        return;
    }

    const text = `${article.title}\n\n${article.extract}\n\n${article.url}`;

    try {
        await navigator.clipboard.writeText(text);
        showToast("Article copied.");
    } catch (error) {
        console.error("Copy failed:", error);
        showToast("Could not copy article.");
    }
}

async function shareArticle(title) {
    const article = await getWikipediaArticle(title);

    if (!article) {
        return;
    }

    if (navigator.share) {
        try {
            await navigator.share({
                title: article.title,
                text: article.extract.slice(0, 250),
                url: article.url
            });

            return;
        } catch (error) {
            if (error.name === "AbortError") {
                return;
            }

            console.error("Share failed:", error);
        }
    }

    await copyArticle(title);
}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(message) {
    const oldToast = document.querySelector(".wikichat-toast");

    if (oldToast) {
        oldToast.remove();
    }

    const toast = document.createElement("div");

    toast.className = "wikichat-toast";
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("show");
    }, 20);

    setTimeout(() => {
        toast.classList.remove("show");

        setTimeout(() => {
            toast.remove();
        }, 250);
    }, 2200);
}


/* =========================================================
   NEW CHAT
   ========================================================= */

function newChat() {
    if (!elements.chat) {
        return;
    }

    const messages = elements.chat.querySelectorAll(
        ".message"
    );

    messages.forEach(message => {
        message.remove();
    });

    state.currentArticle = null;
    state.currentQuery = "";

    if (elements.input) {
        elements.input.value = "";
        elements.input.focus();
    }

    showToast("New chat started.");
}


/* =========================================================
   SUGGESTIONS
   ========================================================= */

function hideSuggestions() {
    if (!elements.suggestions) {
        return;
    }

    elements.suggestions.style.display = "none";
}

function showSuggestions() {
    if (!elements.suggestions) {
        return;
    }

    elements.suggestions.style.display = "flex";
}


/* =========================================================
   MATRIX BACKGROUND
   ========================================================= */

function setupMatrix() {
    const canvas = elements.matrixCanvas;

    if (!canvas) {
        return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
        return;
    }

    const characters =
        "01ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    let columns = 0;
    let drops = [];

    function resizeCanvas() {
        const ratio = window.devicePixelRatio || 1;

        canvas.width = window.innerWidth * ratio;
        canvas.height = window.innerHeight * ratio;

        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;

        context.setTransform(
            ratio,
            0,
            0,
            ratio,
            0,
            0
        );

        columns = Math.floor(window.innerWidth / 18);

        drops = Array.from(
            { length: columns },
            () => Math.random() * -50
        );
    }

    function drawMatrix() {
        context.fillStyle =
            "rgba(2, 6, 4, 0.08)";

        context.fillRect(
            0,
            0,
            window.innerWidth,
            window.innerHeight
        );

        context.font = "14px monospace";

        for (let i = 0; i < drops.length; i++) {
            const character =
                characters[
                    Math.floor(
                        Math.random() * characters.length
                    )
                ];

            const x = i * 18;
            const y = drops[i] * 18;

            context.fillStyle =
                "rgba(0, 255, 115, 0.7)";

            context.fillText(
                character,
                x,
                y
            );

            if (
                y > window.innerHeight &&
                Math.random() > 0.975
            ) {
                drops[i] = 0;
            }

            drops[i] += 0.75;
        }

        requestAnimationFrame(drawMatrix);
    }

    resizeCanvas();

    window.addEventListener(
        "resize",
        resizeCanvas
    );

    drawMatrix();
}


/* =========================================================
   EVENT HANDLERS
   ========================================================= */

function setupEvents() {
    if (elements.form) {
        elements.form.addEventListener(
            "submit",
            event => {
                event.preventDefault();

                if (!elements.input) {
                    return;
                }

                search(elements.input.value);
            }
        );
    }

    if (elements.themeButton) {
        elements.themeButton.addEventListener(
            "click",
            toggleTheme
        );
    }

    if (elements.language) {
        elements.language.addEventListener(
            "change",
            updateLanguage
        );
    }

    if (elements.clearHistoryButton) {
        elements.clearHistoryButton.addEventListener(
            "click",
            clearHistory
        );
    }

    if (elements.bookmarksButton) {
        elements.bookmarksButton.addEventListener(
            "click",
            showBookmarks
        );
    }

    if (elements.newChatButton) {
        elements.newChatButton.addEventListener(
            "click",
            newChat
        );
    }

    if (elements.aboutButton) {
        elements.aboutButton.addEventListener(
            "click",
            showAbout
        );

        }

    document.addEventListener(
        "click",
        handleDocumentClick
    );

    document.addEventListener(
        "keydown",
        handleKeyboard
    );
}

async function handleDocumentClick(event) {
    const target = event.target.closest(
        "[data-action], [data-title]"
    );

    if (!target) {
        return;
    }

    const action =
        target.dataset.action;

    const title =
        target.dataset.title;

    if (target.classList.contains("related-btn")) {
        if (title) {
            search(title);
        }

        return;
    }

    if (action === "read") {
        if (title) {
            await openReader(title);
        }

        return;
    }

    if (action === "bookmark") {
        if (title) {
            const article =
                await getWikipediaArticle(title);

            addBookmark(article);

            showToast("Article saved.");
        }

        return;
    }

    if (action === "remove-bookmark") {
        if (title) {
            removeBookmark(title);
            showBookmarks();
            showToast("Article removed.");
        }

        return;
    }

    if (action === "copy") {
        if (title) {
            await copyArticle(title);
        }

        return;
    }

    if (action === "share") {
        if (title) {
            await shareArticle(title);
        }

        return;
    }

    if (action === "retry-search") {
        const query =
            target.dataset.query;

        if (query) {
            search(query);
        }

        return;
    }

    if (action === "close-reader") {
        closeReader();
    }
}

function handleKeyboard(event) {
    if (
        event.key === "/" &&
        document.activeElement !== elements.input
    ) {
        event.preventDefault();

        if (elements.input) {
            elements.input.focus();
        }

        return;
    }

    if (
        event.key === "Escape"
    ) {
        closeReader();
        hideSuggestions();
    }

    if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
    ) {
        event.preventDefault();

        if (elements.input) {
            elements.input.focus();
            elements.input.select();
        }
    }
}


/* =========================================================
   READER CLOSE
   ========================================================= */

function closeReader() {
    const reader =
        document.querySelector(
            ".reader-overlay"
        );

    if (reader) {
        reader.remove();
    }

    document.body.classList.remove(
        "reader-open"
    );
}


/* =========================================================
   ABOUT
   ========================================================= */

function showAbout() {
    addAssistantMessage(`
        <div class="about-card">
            <h2>WikiChat</h2>

            <p>
                WikiChat is a conversational Wikipedia
                search interface.
            </p>

            <p>
                Search Wikipedia, explore related articles,
                save useful pages, and read articles directly
                inside the interface.
            </p>

            <div class="actions">
                <a
                    class="btn primary"
                    href="https://www.wikipedia.org/"
                    target="_blank"
                    rel="noopener noreferrer">
                    Visit Wikipedia ↗
                </a>
            </div>
        </div>
    `);
}


/* =========================================================
   SEARCH SUGGESTION BUTTONS
   ========================================================= */

function setupSuggestionButtons() {
    const buttons = document.querySelectorAll(
        ".suggestion"
    );

    buttons.forEach(button => {
        button.addEventListener(
            "click",
            () => {
                const query =
                    button.dataset.query ||
                    button.textContent.trim();

                search(query);
            }
        );
    });
}


/* =========================================================
   IMAGE ERROR HANDLING
   ========================================================= */

document.addEventListener(
    "error",
    event => {
        const image = event.target;

        if (
            image instanceof HTMLImageElement &&
            image.classList.contains("thumb")
        ) {
            image.style.display = "none";
        }
    },
    true
);


/* =========================================================
   START APPLICATION
   ========================================================= */

function init() {
    loadStorage();
    setupEvents();
    setupSuggestionButtons();
    setupMatrix();

    if (elements.language) {
        elements.language.value =
            state.language;
    }
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        init
    );
} else {
    init();
}
