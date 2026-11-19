# Building a layout

This example creates a rectangular room and raises its walls. Execute in the open editor page. The helper checks every result and refreshes the generation after each successful change.

```js
const hp = window.homeplan;
if (!hp) throw new Error("Open a house in Floor Builder first.");
console.log(hp.describe());
const initial = await hp.tools.get_state();
if (!initial.ok) throw new Error(initial.error.message);
let generation = initial.generation;
const floorId = initial.data.activeFloorId;
const change = async (name, input) => {
  const result = await hp.callTool(name, {
    ...input,
    expectedGeneration: generation,
    requestId: crypto.randomUUID(),
  });
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  generation = result.generation;
  return result.data;
};
const kitchen = await change("create_room", {
  floorId,
  name: "Kitchen",
  positionMm: { x: 0, y: 0 },
  shape: {
    type: "rectangle",
    positionMm: { x: 0, y: 0 },
    rotationDeg: 0,
    widthMm: 4000,
    depthMm: 3000,
  },
});
await change("raise_walls", {
  areaId: kitchen.areaId,
  heightMm: 2400,
  thicknessMm: 200,
  alignment: "outside",
});
await change("set_view", { floorId, mode: "top", selection: [kitchen.areaId] });
const geometry = await hp.tools.get_geometry({ floorId });
console.log(geometry);
```

`create_floor` adds an independent building floor. `create_room` adds an area and its first footprint together as one undo step. `add_shape` unions another piece into the room's footprint. Circle and polygon inputs are in the catalog. `move_room` sets room placement and rotation. `raise_walls` fills only bare boundary portions, retaining existing walls and their openings; repeating it does not duplicate full walls.

For a coordinated edit, use `batch` with a label and `operations: [{ tool, input }]`. Inner inputs omit generation/request ID. Only model-edit tools are accepted. All steps are prepared and validated before one commit/undo step; any failure leaves the document unchanged. Use IDs already known at the start of the batch. IDs created by batch operations are returned in `data.results`, and can be used in a subsequent call. There is no placeholder/reference syntax inside a batch.

Example input for a batch (replace the illustrative ID and generation with live values):

```json
{
  "label": "Raise kitchen walls and add light",
  "expectedGeneration": 2,
  "requestId": "kitchen-walls-and-light-1",
  "operations": [
    { "tool": "raise_walls", "input": { "areaId": "a_example1" } },
    {
      "tool": "add_light",
      "input": {
        "areaId": "a_example1",
        "name": "Kitchen ceiling",
        "positionMm": { "x": 0, "y": 0 },
        "elevationMm": 2300
      }
    }
  ]
}
```
