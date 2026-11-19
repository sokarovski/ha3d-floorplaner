import type { ReactElement } from "react";
import type { TrashedHouseValue } from "@shared/contracts/houses";
import { Button } from "../../../design-system/components/Button/Button";
import { formatModified } from "../services/houseCardFormat";

type TrashListProps = Readonly<{
  houses: readonly TrashedHouseValue[];
  onRestore: (houseId: string) => void;
  onPurge: (entry: TrashedHouseValue) => void;
}>;

export const TrashList = ({ houses, onRestore, onPurge }: TrashListProps): ReactElement =>
  houses.length === 0 ? (
    <p data-houses-empty="">The trash is empty.</p>
  ) : (
    <table data-trash-table="">
      <thead>
        <tr>
          <th scope="col">House</th>
          <th scope="col">Deleted</th>
          <th scope="col">
            <span data-visually-hidden="">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {houses.map((entry) => (
          <tr key={entry.house.id}>
            <td>{entry.house.status === "ok" ? entry.house.name : `${entry.house.id} (invalid)`}</td>
            <td>{formatModified(entry.trashedAt)}</td>
            <td data-trash-actions="">
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  onRestore(entry.house.id);
                }}
              >
                Restore
              </Button>
              <Button
                size="sm"
                variant="danger"
                onPress={() => {
                  onPurge(entry);
                }}
              >
                Delete permanently…
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
