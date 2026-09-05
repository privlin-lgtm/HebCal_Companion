import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRemembranceService } from "./remembranceService";
import type { CalendarPort, ConvertParams, ConvertResult, IdGenerator, Remembrance, RemembranceRepository } from "./ports";

function makeFakeCalendar(): CalendarPort {
  const convert = vi.fn<(p: ConvertParams) => Promise<ConvertResult>>();
  convert.mockResolvedValue({
    gy: 2025, gm: 9, gd: 23, hy: 5786, hm: "Tishrei", hd: 1,
    hebrew: "א׳ תשרי תשפ״ו", events: [],
  });
  return { convert, getShabbat: vi.fn() };
}

function makeFakeRepo(initial: Remembrance[] = []): RemembranceRepository {
  let records = [...initial];
  return {
    list: async () => records,
    saveAll: async (r: Remembrance[]) => { records = r; return records; },
    mergeUpcoming: async (updates: Map<string, Partial<Remembrance>>) => {
      records = records.map((r) => updates.has(r.id) ? { ...r, ...updates.get(r.id) } : r);
      return records;
    },
    applyRemote: async () => {},
    pendingChanges: async () => [],
    acknowledgeChanges: async () => {},
    getCursor: async () => ({ sequence: 0 }),
    setCursor: async () => {},
    getDeviceId: async () => "test-device",
  };
}

function makeFakeIds(): IdGenerator {
  let n = 0;
  return { next: () => `id-${++n}` };
}

describe("createRemembranceService", () => {
  let calendar: CalendarPort;
  let repo: RemembranceRepository;
  let ids: IdGenerator;

  beforeEach(() => {
    calendar = makeFakeCalendar();
    repo = makeFakeRepo();
    ids = makeFakeIds();
  });

  it("list returns the repository contents", async () => {
    const service = createRemembranceService({ calendar, remembrances: repo, ids });
    expect(await service.list()).toEqual([]);
  });

  it("createFromGregorian converts and saves", async () => {
    const service = createRemembranceService({ calendar, remembrances: repo, ids });
    const record = await service.createFromGregorian({
      name: "Test", type: "Yahrzeit", gy: 2025, gm: 9, gd: 23, originalDate: "2025-09-23",
    });
    expect(record.name).toBe("Test");
    expect(record.hy).toBe(5786);
    expect(record.hm).toBe("Tishrei");
    expect(await service.list()).toHaveLength(1);
  });

  it("remove filters by id and persists the result", async () => {
    const existing: Remembrance[] = [
      { id: "a", name: "A", type: "Yahrzeit", hy: 5786, hm: "Tishrei", hd: 1 },
      { id: "b", name: "B", type: "Anniversary", hy: 5786, hm: "Nisan", hd: 15 },
    ];
    repo = makeFakeRepo(existing);
    const service = createRemembranceService({ calendar, remembrances: repo, ids });
    await service.remove("a");
    expect(await repo.list()).toHaveLength(1);
    expect((await service.list())[0].id).toBe("b");
  });

  it("exportBackup produces a version 2 export", async () => {
    repo = makeFakeRepo([
      { id: "a", name: "A", type: "Yahrzeit", hy: 5786, hm: "Tishrei", hd: 1 },
    ]);
    const service = createRemembranceService({ calendar, remembrances: repo, ids });
    const backup = await service.exportBackup();
    expect(backup.version).toBe(2);
    expect(backup.remembrances).toHaveLength(1);
  });

  it("importBackup merges and reports counts and persists the result", async () => {
    repo = makeFakeRepo([
      { id: "a", name: "A", type: "Yahrzeit", hy: 5786, hm: "Tishrei", hd: 1 },
    ]);
    const service = createRemembranceService({ calendar, remembrances: repo, ids });
    const incoming = [
      { id: "a", name: "A", type: "Yahrzeit", hy: 5786, hm: "Tishrei", hd: 1 },
      { id: "b", name: "B", type: "Anniversary", hy: 5786, hm: "Nisan", hd: 15 },
    ];
    const result = await service.importBackup(incoming);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(await repo.list()).toHaveLength(2);
  });

  it("refreshUpcoming persists calculated dates", async () => {
    const existing: Remembrance = {
      id: "a", name: "A", type: "Yahrzeit", hy: 5786, hm: "Tishrei", hd: 1,
    };
    repo = makeFakeRepo([existing]);
    const service = createRemembranceService({
      calendar,
      remembrances: repo,
      ids,
      clock: { now: () => new Date("2025-01-01T00:00:00.000Z"), todayIso: () => "2025-01-01" },
    });

    await service.refreshUpcoming(5786);

    expect((await repo.list())[0].nextIso).toBe("2025-09-23");
  });
});
