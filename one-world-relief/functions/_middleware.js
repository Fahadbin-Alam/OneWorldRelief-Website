export const onRequest = async ({ request, next }) => {
  const url = new URL(request.url);
  const redirectHosts = new Set(["one-world-relief.com", "www.one-world-relief.com"]);

  if (redirectHosts.has(url.hostname)) {
    url.hostname = "one-world-relief.org";
    return Response.redirect(url.toString(), 301);
  }

  return next();
};
