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
    list: () => records,
    saveAll: (r: Remembrance[]) => { records = r; return records; },
    mergeUpcoming: (updates: Map<string, Partial<Remembrance>>) => {
      records = records.map((r) => updates.has(r.id) ? { ...r, ...updates.get(r.id) } : r);
      return records;
    },
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

  it("list returns the repository contents", () => {
    const service = createRemembranceService({ calendar, remembrances: repo, ids });
    expect(service.list()).toEqual([]);
  });

  it("createFromGregorian converts and saves", async () => {
    const service = createRemembranceService({ calendar, remembrances: repo, ids });
    const record = await service.createFromGregorian({
      name: "Test", type: "Yahrzeit", gy: 2025, gm: 9, gd: 23, originalDate: "2025-09-23",
    });
    expect(record.name).toBe("Test");
    expect(record.hy).toBe(5786);
    expect(record.hm).toBe("Tishrei");
    expect(service.list()).toHaveLength(1);
  });

  it("remove filters by id", () => {
    const existing: Remembrance[] = [
      { id: "a", name: "A", type: "Yahrzeit", hy: 5786, hm: "Tishrei", hd: 1 },
      { id: "b", name: "B", type: "Anniversary", hy: 5786, hm: "Nisan", hd: 15 },
    ];
    repo = makeFakeRepo(existing);
    const service = createRemembranceService({ calendar, remembrances: repo, ids });
    service.remove("a");
    expect(service.list()).toHaveLength(1);
    expect(service.list()[0].id).toBe("b");
  });

  it("exportBackup produces a version 2 export", () => {
    repo = makeFakeRepo([
      { id: "a", name: "A", type: "Yahrzeit", hy: 5786, hm: "Tishrei", hd: 1 },
    ]);
    const service = createRemembranceService({ calendar, remembrances: repo, ids });
    const backup = service.exportBackup();
    expect(backup.version).toBe(2);
    expect(backup.remembrances).toHaveLength(1);
  });

  it("importBackup merges and reports counts", () => {
    repo = makeFakeRepo([
      { id: "a", name: "A", type: "Yahrzeit", hy: 5786, hm: "Tishrei", hd: 1 },
    ]);
    const service = createRemembranceService({ calendar, remembrances: repo, ids });
    const incoming = [
      { id: "a", name: "A", type: "Yahrzeit", hy: 5786, hm: "Tishrei", hd: 1 },
      { id: "b", name: "B", type: "Anniversary", hy: 5786, hm: "Nisan", hd: 15 },
    ];
    const result = service.importBackup(incoming);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(service.list()).toHaveLength(2);
  });
});
