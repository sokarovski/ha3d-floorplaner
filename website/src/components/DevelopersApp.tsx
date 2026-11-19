import type { ReactElement } from "react";
import { useHashTarget } from "../hooks/useHashTarget";
import { links } from "../content/links";
import { pages } from "../content/pages";
import { CommandBlock } from "./CommandBlock";
import { Contributing } from "./Contributing";
import { DevMode } from "./DevMode";
import { LinkButton } from "./LinkButton";
import { Section } from "./Section";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

// The developers page: run from source, DEV MODE against Home Assistant, build what ships, and contribute.
export const DevelopersApp = (): ReactElement => {
  useHashTarget();
  return (
    <>
      <SiteHeader page="developers" />
      <main id="main" tabIndex={-1}>
        <Section
          id="source"
          title="Run Homeplan from source"
          lead="The builder is a React and TypeScript app with a Node (Fastify) backend; the Home Assistant panel is a Lit and Three.js viewer shipped by the Python integration. One repository holds all of it."
        >
          <div data-site-roomy="">
            <p data-site-requirement="">
              Node.js 20.19 or newer (Node 24 recommended), npm 11, Git, and a current Chromium-based browser
              with WebGL 2. Blender is not needed; it only powers an experimental photorealistic render.
            </p>
            <ol data-site-steps="">
              <li>
                <strong>Clone and install.</strong>
                <CommandBlock
                  label="Commands to clone and install"
                  lines={[`git clone ${links.appRepositoryGit}`, "cd ha3d-floorplaner", "npm ci"]}
                />
              </li>
              <li>
                <strong>Start the development servers.</strong>
                <CommandBlock label="Command to start development" lines={["npm run dev"]} />
                This starts the backend on port 4310 and the Vite dev server on{" "}
                <code>http://localhost:5173</code>, with hot reload for the builder. Houses are kept in{" "}
                <code>.homeplan-data/</code>, and the three demo houses are created on the first start.
              </li>
              <li>
                <strong>Try the production build.</strong> <code>npm run build</code> then{" "}
                <code>npm start</code> serves the builder and its API together on{" "}
                <code>http://localhost:4310</code>, as the app does.
              </li>
            </ol>
            <p data-site-note="">
              Every command, setting and environment variable is listed in the{" "}
              <a href={links.readme}>README</a>.
            </p>
          </div>
        </Section>
        <DevMode />
        <Section
          id="build"
          title="Test it the way users get it"
          lead="DEV MODE runs your code straight from the development server. Before you share a change, build the same packages users install and try those: the panel's viewer, the integration ZIP and the app."
        >
          <dl data-site-definitions="">
            <div>
              <dt>The panel's viewer</dt>
              <dd>
                <code>npm run build:ha-viewer</code> turns the 3D viewer into the finished files the
                integration ships. Your builder then offers them, so <em>Upgrade panel</em> can install
                exactly this version.
              </dd>
            </div>
            <div>
              <dt>The integration</dt>
              <dd>
                <code>npm run ha:package</code> makes <code>homeplan.zip</code> in <code>dist/</code>: the
                same file the Marketplace installs. Unzip it into a test Home Assistant&apos;s{" "}
                <code>custom_components/homeplan/</code> to try a change to the Python side too.
              </dd>
            </div>
            <div>
              <dt>The app</dt>
              <dd>
                <code>docker build -t homeplan-app .</code> builds the same image Home Assistant builds on the
                device. Run it with <code>docker run -p 8099:8099 -v homeplan-data:/data homeplan-app</code>{" "}
                and open <code>http://localhost:8099</code>. <code>npm run app:check</code> checks the
                app&apos;s settings.
              </dd>
            </div>
          </dl>
        </Section>
        <Contributing />
        <Section id="next" title="Not a developer?">
          <div data-site-actions="">
            <LinkButton href={pages.install} icon="chevronRight">
              Install Homeplan
            </LinkButton>
            <LinkButton href={pages.possibilities} variant="secondary" icon="chevronRight">
              Learn More
            </LinkButton>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
};
