// Public destinations used by the showcase page. Every link is a plain URL so it works from the static
// GitHub Pages build without a backend.

const appRepository = "https://github.com/sokarovski/ha3d-floorplaner";
const integrationRepository = "https://github.com/sokarovski/ha3d";

export const links = {
  appRepository,
  appRepositoryGit: `${appRepository}.git`,
  readme: `${appRepository}#readme`,
  issues: `${appRepository}/issues`,
  licence: `${appRepository}/blob/main/LICENSE`,
  agentGuide: `${appRepository}/blob/main/public/agent.md`,
  integrationRepository,
  integrationReleases: `${integrationRepository}/releases`,
} as const;
