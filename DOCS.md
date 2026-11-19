# Homeplan

Homeplan is a 3D home builder. Draw floors, walls, doors, windows, lights and furniture, then show the house in Home Assistant with the **Homeplan** integration and bind its lights and devices to your entities.

This app runs the builder on your Home Assistant machine. It is built on your device from the published source the first time you install it and after each update, so installation takes several minutes.

## First start

On its first start the app creates three demo houses: **Demo: City apartment**, **Demo: Garden bungalow** and **Demo: Family house**. Open one to look around, or create your own house. A demo house you delete does not come back.

## Opening the builder

Open **Homeplan** in the Home Assistant sidebar (turn on **Show in sidebar** on the app's page if it is not there). The builder opens only through Home Assistant, so your Home Assistant login protects it. The app publishes no network port of its own.

Photorealistic rendering (Blender) is not included in the app; the builder reports it as unavailable. Editing, the Home Assistant panel and PNG exports do not need it.

## Connecting the Homeplan integration

Install the **Homeplan** integration (from the Marketplace or as a manual download). When the app is running, Home Assistant finds it automatically: **Settings → Devices & services** shows **Discovered: Homeplan**. Select **Add** and confirm; no address needs to be typed. The integration talks to the app over Home Assistant's internal network.

The order does not matter. If the integration is installed after the app, the discovered card appears within about 15 minutes, or at once after restarting the app.

An integration that is already set up with a manually entered builder address keeps that address.

## Your data and backups

Houses, their images and templates, each house's revision history (every **Save** is a revision) and the builder's preferences are stored in the app's private data folder. It is kept when the app is updated or restarted and is part of Home Assistant backups that include the app. Restoring such a backup restores the houses.

Uninstalling the app deletes this data. Make a backup first if you may want it back.

## Support

Source, documentation and issues: <https://github.com/sokarovski/ha3d-floorplaner>.
