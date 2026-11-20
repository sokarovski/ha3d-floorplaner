# House image uploads and reusable textures

Updated: 2026-11-20 (proposed material values of an image).

Status: MVP Phase 1. Image uploads stored in each house's `textures/` folder and reused as surface textures are owner requirements; accepted formats are JPEG, PNG, and WebP ([D19](../../decisions.md#d19-materials)). The image index is server-owned ([D14](../../decisions.md#d14-project-management-and-names)). Limits and deletion follow [D14](../../decisions.md#d14-project-management-and-names) and [D16](../../decisions.md#d16-interaction-defaults-and-support-limits).

## House-owned image library

Allow uploading JPEG (`.jpg`/`.jpeg`), PNG (`.png`), and WebP (`.webp`) images to a house ([D19](../../decisions.md#d19-materials)). Store the files in `data/<house-id>/textures/` (under the server's data directory, `DATA_DIR`, default `.homeplan-data`), rather than as loose files in the house root, and make them available to all its floors, areas, and objects.

Images are reusable assets, not owned exclusively by the first surface that uses them. One parquet image can be reused by several rooms, and an uploaded image can be selected later rather than immediately assigned on upload.

Storage layout (asset filenames are illustrative):

```text
data/
  <house-id>/
    house.json                       # references images by ID only
    textures/
      images.json                    # server-owned image index
      <image-asset-id>.jpg
      <image-asset-id>.thumb.webp
      <another-image-asset-id>.png
```

The asset belongs to the house and moves with its folder when backed up or copied. Its metadata lives in the server-owned index `textures/images.json`: stable asset ID, display name, original filename, relative path, media type, pixel dimensions, thumbnail path, and optionally the image's [proposed material values](materials-and-objects.md#proposed-texture-values) (`texture`: the size of one repeat, roughness, metallic; set with `PATCH`, added 2026-11-20). The client never writes this index, and it is not part of `house.json`, so an upload never changes the document revision ([D09](../../decisions.md#d09-saving-cancellation-and-model-undo)). Uploads are limited to 25 MB and 8192 px on the longest side, and the backend generates a WebP thumbnail that fits inside 256 × 256 px without enlarging (`server/services/imageService.ts`). JPEG files are stored with the `.jpg` extension. The stored original is not the uploaded file byte for byte: the backend turns it upright by its EXIF orientation and re-encodes it in the same format without any metadata (EXIF including GPS position, XMP, IPTC, embedded ICC profile; colors are converted to sRGB): JPEG at quality 95 with 4:4:4 chroma, WebP at quality 95, PNG losslessly. The index records the stored file's pixel dimensions and byte size. The original filename is kept in the index only as a label.

## Use on surfaces

Expose the house image library in material/texture selection for any rendered surface with a material slot, including:

- Area flooring and carpets.
- Interior/exterior wall faces and any other exposed wall material slots.
- Doors, windows, staircase parts, ornaments, and fixtures where their templates expose suitable material slots.

An uploaded image normally supplies a material's **base-color texture**. It is not automatically a complete physically based material or a roughness/normal map. The material can provide additional appearance properties as specified in [materials and objects](materials-and-objects.md).

Each assignment needs a mapping from the image onto its surface. MVP offers physical tile size, rotation, and offset only, with no stretch-to-fit mode ([D19](../../decisions.md#d19-materials)). Use the project's mixed-unit length fields for physical texture dimensions. Image pixel dimensions remain image metadata, not physical model lengths.

Generated floors/walls should have predictable texture coordinates. Templates bring their own UVs from glTF; converted STL models have none and use box projection. Supporting an image library does not imply that arbitrary imported meshes already have usable texture mapping; see [object templates](object-templates.md).

Reference assets by stable ID from materials/assignments rather than embedding the uploaded image into `house.json`. Allow independent mapping settings for different surfaces using the same image. Reassigning a surface does not modify the source file or unintentionally change other assignments.

## Editor and API integration

Provide upload and browse/select access for the active house. The entry points are an Upload button inside the material picker (the `image` property editor) and the **Images (n)** group in the house properties (select the House row), which lists the images with Rename and Delete buttons and an **Upload image…** button. The same panel holds the house's **Templates** and **Material presets** groups.

The material picker also shows the **Built-in textures** below the house's images (Phase 17.1, [materials](materials-and-objects.md#1-materials-and-image-textures)). They ship with the app, are referenced by their `builtinimg_…` ID like an upload, and never appear in the **Images (n)** group: they cannot be renamed or deleted and are not copied into the house.

The routes (list, upload, rename, delete, file, thumbnail) are owned by the [API specification](../../architecture/api.md#images).

The multipart request shape is an implementation contract. Asset serving must work for the browser renderer and the backend render adapter; HA delivery is post-MVP ([publishing](../../home-assistant/publishing.md)).

Images can be renamed and deleted only when neither the current document nor a surviving history entry references them. The server checks `house.json`, and the client checks its live history before it requests the delete. Replacing an image's bytes is post-MVP.

## Upload and model Undo

Uploading an image and its index entry are outside model Undo. Assigning that image to a material is a reversible model command. Undo restores the previous material/reference while retaining the uploaded bytes/library entry; Redo can reuse the same stable asset ID.

Do not remove source files merely because an undone assignment leaves them temporarily unused. Retain assets needed by current documents or live history. Cleanup/permanent replacement/deletion is a separate workflow under its reference/recovery policy, not an automatic inverse JSON patch. See [model undo/redo](../undo-redo.md#uploads-and-other-file-operations).

## Verification scenarios

- JPEG, PNG, and WebP uploads survive reload/restart inside the correct house folder.
- An upload during unsaved editing does not change the `house.json` revision; the next save succeeds.
- Uploads appear in that house's library and can be assigned later to supported surface slots.
- Several floors/surfaces reuse one image with independent mapping settings.
- A material assignment survives save/load and produces the corresponding texture in preview and final renders.
- The backend render job resolves every referenced image from the frozen snapshot.
- Invalid/unsupported uploads and missing assets produce understandable feedback without corrupting existing assignments.
