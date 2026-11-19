// Which property schema the panel walks for each entity kind (D18). Template instances get their
// template's parameters through the template registry (milestone 1.7).
import type { EntityRef } from "@shared/domain/house/entityIndex";
import { FloorSurface, Area } from "@shared/domain/schemas/area";
import { Carpet } from "@shared/domain/schemas/carpet";
import { BuildingFloor } from "@shared/domain/schemas/floor";
import { Guide } from "@shared/domain/schemas/guide";
import { House } from "@shared/domain/schemas/house";
import { AmbientEffect, effectKindLabel } from "@shared/domain/schemas/effects";
import { AreableInstance, WallableInstance } from "@shared/domain/schemas/instances";
import { Light, LightGroup } from "@shared/domain/schemas/light";
import { ObjectGroup } from "@shared/domain/schemas/objectGroup";
import { Roof, RoofHole, RoofLine, RoofPoint, RoofWindow } from "@shared/domain/schemas/roof";
import { CircleShape, PolygonShape, RectangleShape } from "@shared/domain/schemas/shapes";
import { Wall, WallRelief } from "@shared/domain/schemas/wall";

export type InstanceSchemaResolver = (ref: EntityRef) => object | undefined;

export const schemaForEntity = (ref: EntityRef, instanceSchema: InstanceSchemaResolver): object => {
  switch (ref.kind) {
    case "house":
      return House;
    case "floor":
      return BuildingFloor;
    case "area":
      return Area;
    case "floorSurface":
      return FloorSurface;
    case "shape":
      return ref.value.type === "rectangle"
        ? RectangleShape
        : ref.value.type === "circle"
          ? CircleShape
          : PolygonShape;
    case "carpet":
      return Carpet;
    case "wall":
      return Wall;
    case "opening":
      return instanceSchema(ref) ?? WallableInstance;
    case "relief":
      return WallRelief;
    case "object":
      return instanceSchema(ref) ?? AreableInstance;
    case "effect":
      return AmbientEffect;
    case "light":
      return Light;
    case "objectGroup":
      return ObjectGroup;
    case "lightGroup":
      return LightGroup;
    case "guide":
      return Guide;
    case "roof":
      return Roof;
    case "roofPoint":
      return RoofPoint;
    case "roofLine":
      return RoofLine;
    case "roofHole":
      return RoofHole;
    case "roofWindow":
      return RoofWindow;
  }
};

export const kindLabel = (ref: EntityRef): string => {
  switch (ref.kind) {
    case "house":
      return "House";
    case "floor":
      return "Building floor";
    case "area":
      return ref.value.kind === "yard" ? "Yard" : "Area";
    case "floorSurface":
      return "Floor shape";
    case "shape":
      return ref.carpetId === undefined ? `${ref.value.type} shape` : `Carpet ${ref.value.type}`;
    case "carpet":
      return "Carpet";
    case "wall":
      return "Wall";
    case "opening":
      return "Door or window";
    case "relief":
      return ref.value.depthMm < 0 ? "Niche" : "Box";
    case "object":
      return ref.value.floorCut === "stair"
        ? "Staircase"
        : ref.value.floorCut === "opening"
          ? "Floor opening"
          : "Object";
    case "effect":
      return effectKindLabel(ref.value.kind);
    case "light":
      return "Light";
    case "objectGroup":
      return "Object group";
    case "lightGroup":
      return "Light group";
    case "guide":
      return "Guide";
    case "roof":
      return "Roof";
    case "roofPoint":
      return "Roof point";
    case "roofLine":
      return ref.value.kind === "step" ? "Step line" : "Break line";
    case "roofHole":
      return "Roof hole";
    case "roofWindow":
      return "Roof window";
  }
};
