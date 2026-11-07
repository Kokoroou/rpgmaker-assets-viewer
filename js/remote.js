// Open a game published with rpgmaker-web-toolkit through a share link (⚙ → Share → MakerLens link in the game).
// No DOM here (tested in node). The same file lives in MakerLens Events.
//
// The link looks like  https://makerlens…/assets/#game=<https://site.workers.dev>&t=<token>
// The token sits after the "#", so it never goes to MakerLens; the page sends it only to the
// game's own site, as `Authorization: Bearer`, without cookies. It is kept in memory only.
//
//   GET <site>/_lens/ping            -> { ok, expires }
//   GET <site>/_lens/manifest        -> { title, engine, files: { "img/x.png_": size } }
//   GET <site>/_lens/file/<path>     -> the file (data/, img/, audio/, js/plugins.js)
//
// The viewer stays read-only: nothing is written to the game, and the game's files are read
// straight into this browser, not through any MakerLens server.

class RemoteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RemoteError';
    this.code = code;
  }
}

const Remote = (() => {
  const TOKEN = /^[A-Za-z0-9_-]{4,64}\.[A-Za-z0-9_-]{16,128}$/;

  // "#game=…&t=…" or a whole link -> { origin, token }; throws RemoteError('link', …)
  function parseLink(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new RemoteError('link', 'Paste the link made by the toolkit.');
    let hash = raw;
    const at = raw.indexOf('#');
    if (at >= 0) hash = raw.slice(at + 1);
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const game = params.get('game'), token = params.get('t');
    if (!game || !token) {
      throw new RemoteError('link', 'This is not a MakerLens link. It should look like …/#game=https://…workers.dev&t=…');
    }
    let url;
    try { url = new URL(game); } catch { throw new RemoteError('link', 'The game address in the link is not valid.'); }
    if (url.protocol !== 'https:' || url.username || url.password || !/\.workers\.dev$/i.test(url.hostname)) {
      throw new RemoteError('link', 'Only games published with the toolkit (an https://….workers.dev address) can be opened this way.');
    }
    if (!TOKEN.test(token)) throw new RemoteError('link', 'The link’s token looks damaged. Copy the whole link again.');
    return { origin: url.origin, token };
  }

  // Link in the page address (opened from the game’s Share menu) -> { origin, token } | null.
  // Does not throw: a page opened without a link is the normal case.
  function fromLocation(hash) {
    if (!/(^|[#&])game=/.test(hash || '')) return null;
    try { return parseLink(hash); } catch { return null; }
  }

  const pathOf = rel => rel.split('/').map(encodeURIComponent).join('/');

  function client({ origin, token }, fetchImpl = (...a) => fetch(...a)) {
    async function request(path, init) {
      let res;
      try {
        res = await fetchImpl(`${origin}/_lens/${path}`, {
          ...init,
          headers: { authorization: `Bearer ${token}` },
          credentials: 'omit',
          redirect: 'manual',
        });
      } catch {
        throw new RemoteError('network', 'Could not reach the game. Check the link and your connection.');
      }
      if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
        throw new RemoteError('access', 'The game’s sign-in page answered instead of the game. Ask its owner for a new link (made in the game: ⚙ → Share → MakerLens link; the owner may need to run rwk deploy once more).');
      }
      if (res.status === 401) throw new RemoteError('expired', 'This link has expired or was stopped. Ask the owner of the game for a new one.');
      if (res.status === 404) throw new RemoteError('missing', 'This game does not support MakerLens links yet. Its owner has to update the toolkit and publish it again.');
      if (!res.ok) throw new RemoteError('http', `The game answered with an error (${res.status}).`);
      return res;
    }

    return {
      origin,
      host: new URL(origin).hostname,
      async ping() { return (await request('ping')).json(); },
      async manifest() {
        const m = await (await request('manifest')).json();
        if (!m || typeof m.files !== 'object' || !m.files) throw new RemoteError('http', 'The game’s file list is not readable.');
        return m;
      },
      async blob(rel) { return (await request(`file/${pathOf(rel)}`)).blob(); },
      async json(rel) { return JSON.parse(await (await request(`file/${pathOf(rel)}`)).text()); },
      // A File for the viewers’ lazy entries (each is read when first shown).
      async file(rel) {
        const name = rel.split('/').pop();
        return new File([await this.blob(rel)], name);
      },
    };
  }

  return { parseLink, fromLocation, client };
})();
