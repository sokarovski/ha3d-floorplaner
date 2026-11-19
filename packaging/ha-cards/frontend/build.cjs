// Runs the rspack build of Homeplan's HA cards bundle inside the home-assistant/frontend checkout
// (scripts/build-ha-cards.mjs copies this folder there as homeplan-cards/).
const { rspack } = require("@rspack/core");
const config = require("./rspack.config.cjs");

rspack(config, (error, stats) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(stats.toString({ colors: false, assets: false, chunks: false, modules: false }));
  if (stats.hasErrors()) process.exit(1);
});
