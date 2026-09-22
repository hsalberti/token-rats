// Deploy this entry point before a migration that cannot run with the old API.
// After the migration, deploy the normal entry point from wrangler.toml.
export { RoomLiveHub } from "./lib/room-live-hub.js";

export default {
  fetch() {
    return Response.json(
      { error: "maintenance", message: "Token Rats is updating. Please retry shortly." },
      { status: 503, headers: { "Retry-After": "60" } },
    );
  },
  async scheduled() {},
};
