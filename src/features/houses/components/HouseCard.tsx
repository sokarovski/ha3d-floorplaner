import type { ReactElement } from "react";
import { Link } from "react-router";
import type { HouseCardValue } from "@shared/contracts/houses";
import { Icon } from "../../../design-system/components/Icon/Icon";
import { MenuButton } from "../../../design-system/components/MenuButton/MenuButton";
import { paths } from "../../../app/routes/paths";
import { floorCountLabel, formatModified } from "../services/houseCardFormat";

type HouseCardProps = Readonly<{
  house: HouseCardValue;
  onAction: (action: "rename" | "clone" | "delete", house: HouseCardValue) => void;
}>;

export const HouseCard = ({ house, onAction }: HouseCardProps): ReactElement => (
  <article data-house-card="" data-house-card-invalid={house.status === "invalid" ? "" : undefined}>
    {house.status === "ok" ? (
      <Link to={paths.house(house.id)} data-house-card-link="">
        <span data-house-card-icon="">
          <Icon name="home" size="lg" />
        </span>
        <span data-house-card-name="">{house.name}</span>
        <span data-house-card-meta="">{floorCountLabel(house.floorCount)}</span>
        <span data-house-card-meta="">Modified {formatModified(house.modifiedAt)}</span>
      </Link>
    ) : (
      <div data-house-card-link="">
        <span data-house-card-icon="">
          <Icon name="warning" size="lg" label="Invalid house" />
        </span>
        <span data-house-card-name="">{house.id}</span>
        <span data-house-card-meta="">{house.problem.message}</span>
        <span data-house-card-meta="">Modified {formatModified(house.modifiedAt)}</span>
      </div>
    )}
    <div data-house-card-menu="">
      <MenuButton
        label={`Actions for ${house.status === "ok" ? house.name : house.id}`}
        icon="menu"
        size="sm"
        placement="bottom end"
        items={
          house.status === "ok"
            ? [
                { id: "rename", label: "Rename…", icon: "edit" },
                { id: "clone", label: "Clone", icon: "copy" },
                { id: "delete", label: "Delete…", icon: "trash", danger: true },
              ]
            : [{ id: "delete", label: "Move to trash…", icon: "trash", danger: true }]
        }
        onAction={(id) => {
          if (id === "rename" || id === "clone" || id === "delete") onAction(id, house);
        }}
      />
    </div>
  </article>
);
