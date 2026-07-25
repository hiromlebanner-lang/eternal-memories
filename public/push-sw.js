/* global self, URL */

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "MapAlbumの参加申請";
  const options = {
    body: payload.body || "新しい参加申請が届きました",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "mapalbum-join-request",
    data: {
      url: payload.url || "/",
      albumID: payload.albumID || null,
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedURL = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  );
  const targetURL = new URL("/", self.location.origin);
  const albumID = requestedURL.searchParams.get("manageJoin");
  if (
    requestedURL.origin === self.location.origin &&
    albumID &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      albumID,
    )
  ) {
    targetURL.searchParams.set("manageJoin", albumID);
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (new URL(client.url).origin === targetURL.origin) {
            return client
              .navigate(targetURL.href)
              .then((navigatedClient) => (navigatedClient || client).focus());
          }
        }
        return self.clients.openWindow(targetURL.href);
      }),
  );
});
