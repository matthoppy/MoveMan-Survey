"use client";

import { useMemo, useState } from "react";
import { CATALOG, matchCatalog } from "@/lib/catalog";
import type { InventoryItem, PackingLevel, RoomSurvey } from "@/lib/types";

const PACKING_LEVELS: Array<{ value: PackingLevel; label: string }> = [
  { value: "none", label: "Customer packs" },
  { value: "part", label: "Part pack" },
  { value: "full", label: "Full pack" },
];

export function InventoryTable({
  items,
  rooms,
  onItemsChange,
  onRoomsChange,
}: {
  items: InventoryItem[];
  rooms: RoomSurvey[];
  onItemsChange: (items: InventoryItem[]) => void;
  onRoomsChange: (rooms: RoomSurvey[]) => void;
}) {
  const [adding, setAdding] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    for (const room of rooms) map.set(room.name, []);
    for (const item of items) {
      const list = map.get(item.room) ?? [];
      list.push(item);
      map.set(item.room, list);
    }
    return [...map.entries()];
  }, [items, rooms]);

  const update = (id: string, patch: Partial<InventoryItem>) =>
    onItemsChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const remove = (id: string) => onItemsChange(items.filter((item) => item.id !== id));

  const setPackingLevel = (roomName: string, level: PackingLevel) => {
    const exists = rooms.some((r) => r.name === roomName);
    onRoomsChange(
      exists
        ? rooms.map((r) => (r.name === roomName ? { ...r, packingLevel: level } : r))
        : [...rooms, { name: roomName, packingLevel: level }],
    );
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Inventory</h2>
        <div className="row-tight">
          <span className="tiny faint">
            {items.reduce((n, i) => n + i.quantity, 0)} items · {rooms.length} rooms
          </span>
          <button className="btn btn-sm" onClick={() => setAdding((v) => !v)}>
            {adding ? "Cancel" : "Add item"}
          </button>
        </div>
      </div>

      {adding && (
        <div className="card-body" style={{ borderBottom: "1px solid var(--border)" }}>
          <AddItemForm
            rooms={rooms}
            onAdd={(item) => {
              onItemsChange([...items, item]);
              if (!rooms.some((r) => r.name === item.room)) {
                onRoomsChange([...rooms, { name: item.room, packingLevel: "none" }]);
              }
              setAdding(false);
            }}
          />
        </div>
      )}

      {items.length === 0 && !adding ? (
        <div className="empty">
          <p className="small">
            No inventory yet. Run the video analysis, or add items by hand.
          </p>
        </div>
      ) : (
        <div className="card-body-flush table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Item</th>
                <th className="num" style={{ width: "4rem" }}>
                  Qty
                </th>
                <th className="num" style={{ width: "6rem" }}>
                  Cu ft
                </th>
                <th style={{ width: "8rem" }}>Handling</th>
                <th style={{ width: "3rem" }} />
              </tr>
            </thead>
            <tbody>
              {grouped.map(([roomName, roomItems]) => {
                const room = rooms.find((r) => r.name === roomName);
                const roomCuFt = roomItems.reduce((n, i) => n + i.volumeCuFt * i.quantity, 0);

                return (
                  <RoomGroup
                    key={roomName}
                    roomName={roomName}
                    roomCuFt={roomCuFt}
                    packingLevel={room?.packingLevel ?? "none"}
                    items={roomItems}
                    onPackingLevel={(level) => setPackingLevel(roomName, level)}
                    onUpdate={update}
                    onRemove={remove}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RoomGroup({
  roomName,
  roomCuFt,
  packingLevel,
  items,
  onPackingLevel,
  onUpdate,
  onRemove,
}: {
  roomName: string;
  roomCuFt: number;
  packingLevel: PackingLevel;
  items: InventoryItem[];
  onPackingLevel: (level: PackingLevel) => void;
  onUpdate: (id: string, patch: Partial<InventoryItem>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      <tr className="room-row">
        <td>{roomName}</td>
        <td className="num">{items.reduce((n, i) => n + i.quantity, 0)}</td>
        <td className="num">{Math.round(roomCuFt)}</td>
        <td colSpan={2}>
          <select
            className="select input-sm"
            value={packingLevel}
            onChange={(e) => onPackingLevel(e.target.value as PackingLevel)}
            aria-label={`Packing level for ${roomName}`}
          >
            {PACKING_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
        </td>
      </tr>

      {items.map((item) => (
        <tr key={item.id}>
          <td>
            <div>{item.name}</div>
            <div className="row-tight" style={{ marginTop: "0.15rem" }}>
              {item.source === "ai" && typeof item.confidence === "number" && item.confidence < 0.6 && (
                <span className="badge badge-warning">low confidence</span>
              )}
              {item.source === "manual" && <span className="badge badge-neutral">added by hand</span>}
              {item.packing === "specialist" && <span className="badge badge-danger">specialist</span>}
              {item.notes && <span className="tiny faint">{item.notes}</span>}
            </div>
          </td>
          <td className="num">
            <input
              className="input input-sm input-num"
              type="number"
              min={1}
              max={999}
              value={item.quantity}
              aria-label={`Quantity of ${item.name}`}
              onChange={(e) => onUpdate(item.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
            />
          </td>
          <td className="num">
            <input
              className="input input-sm input-num"
              type="number"
              min={0}
              max={500}
              step={0.5}
              value={item.volumeCuFt}
              aria-label={`Cubic feet per ${item.name}`}
              onChange={(e) => onUpdate(item.id, { volumeCuFt: Math.max(0, Number(e.target.value) || 0) })}
            />
          </td>
          <td>
            <div className="stack-sm">
              <label className="check tiny">
                <input
                  type="checkbox"
                  checked={item.fragile}
                  onChange={(e) => onUpdate(item.id, { fragile: e.target.checked })}
                />
                Fragile
              </label>
              <label className="check tiny">
                <input
                  type="checkbox"
                  checked={item.dismantle}
                  onChange={(e) => onUpdate(item.id, { dismantle: e.target.checked })}
                />
                Dismantle
              </label>
            </div>
          </td>
          <td>
            <button
              className="btn btn-sm btn-danger"
              onClick={() => onRemove(item.id)}
              aria-label={`Remove ${item.name}`}
              title="Remove"
            >
              ×
            </button>
          </td>
        </tr>
      ))}

      {items.length === 0 && (
        <tr>
          <td colSpan={5} className="tiny faint">
            Nothing listed in this room.
          </td>
        </tr>
      )}
    </>
  );
}

function AddItemForm({ rooms, onAdd }: { rooms: RoomSurvey[]; onAdd: (item: InventoryItem) => void }) {
  const [room, setRoom] = useState(rooms[0]?.name ?? "Lounge");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);

  const match = name.trim() ? matchCatalog(name, room) : undefined;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    onAdd({
      id: crypto.randomUUID(),
      room: room.trim() || "Unspecified",
      name: match?.name ?? trimmed,
      catalogId: match?.id ?? null,
      quantity,
      volumeCuFt: match?.cuFt ?? 8,
      fragile: match?.fragile ?? false,
      twoPersonLift: match?.twoPersonLift ?? false,
      dismantle: match?.dismantle ?? false,
      packing: match?.packing ?? "wrap",
      source: "manual",
    });

    setName("");
    setQuantity(1);
  }

  return (
    <form onSubmit={submit} className="stack-sm">
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ width: "10rem" }}>
          <label className="label" htmlFor="add-room">
            Room
          </label>
          <input
            id="add-room"
            className="input input-sm"
            list="room-options"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          />
          <datalist id="room-options">
            {rooms.map((r) => (
              <option key={r.name} value={r.name} />
            ))}
          </datalist>
        </div>

        <div className="field grow">
          <label className="label" htmlFor="add-name">
            Item
          </label>
          <input
            id="add-name"
            className="input input-sm"
            list="catalog-options"
            value={name}
            placeholder="3-seater sofa"
            onChange={(e) => setName(e.target.value)}
          />
          <datalist id="catalog-options">
            {CATALOG.map((entry) => (
              <option key={entry.id} value={entry.name} />
            ))}
          </datalist>
        </div>

        <div className="field" style={{ width: "5rem" }}>
          <label className="label" htmlFor="add-qty">
            Qty
          </label>
          <input
            id="add-qty"
            className="input input-sm"
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>

        <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}>
          Add
        </button>
      </div>

      <p className="hint">
        {match
          ? `Matches "${match.name}" — ${match.cuFt} cu ft each.`
          : name.trim()
            ? "Not in the catalogue — it will be added at 8 cu ft, adjust it in the table."
            : "Start typing to match the volume catalogue."}
      </p>
    </form>
  );
}
