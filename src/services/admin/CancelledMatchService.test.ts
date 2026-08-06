import { test } from "vitest";
import { strict as assert } from "node:assert";
import { CancelledMatchService } from "./CancelledMatchService";

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function serviceWith(response: { status: number; body?: unknown }) {
  const calls: { url: string; method: string }[] = [];
  const impl: typeof globalThis.fetch = (input, init) => {
    calls.push({ url: urlOf(input), method: init?.method ?? "GET" });
    const body = response.body === undefined ? null : JSON.stringify(response.body);
    return Promise.resolve(
      new Response(body, {
        status: response.status,
        headers: body === null ? undefined : { "Content-Type": "application/json" },
      }),
    );
  };
  return {
    calls,
    service: new CancelledMatchService({ endpoint: "https://api.example.com/", fetch: impl }),
  };
}

test("getCancelledMatches requests the admin endpoint with paging", async () => {
  const { service, calls } = serviceWith({ status: 200, body: { total: 2, matches: [] } });

  const page = await service.getCancelledMatches("tok", { gameMode: 0, page: 2, itemsPerPage: 25 });

  assert.equal(page.total, 2);
  assert.ok(calls[0].url.startsWith("https://api.example.com/api/admin/matches/canceled?"));
  assert.ok(calls[0].url.includes("page=2"));
  assert.ok(calls[0].url.includes("itemsPerPage=25"));
});

test("getCancelledMatches omits an all-modes filter and an empty battle tag", async () => {
  const { service, calls } = serviceWith({ status: 200, body: { total: 0, matches: [] } });

  await service.getCancelledMatches("tok", { gameMode: 0, page: 1, itemsPerPage: 25, battleTag: "" });

  assert.ok(!calls[0].url.includes("gameMode="));
  assert.ok(!calls[0].url.includes("playerBattleTag="));
});

test("getCancelledMatches sends the selected mode and encodes the battle tag", async () => {
  const { service, calls } = serviceWith({ status: 200, body: { total: 0, matches: [] } });

  await service.getCancelledMatches("tok", { gameMode: 5, page: 1, itemsPerPage: 25, battleTag: "Tester#1234" });

  assert.ok(calls[0].url.includes("gameMode=5"));
  assert.ok(calls[0].url.includes("playerBattleTag=Tester%231234"));
});

test("getCancelledMatches surfaces a failure rather than an empty page", async () => {
  const { service } = serviceWith({ status: 403 });

  await assert.rejects(() => service.getCancelledMatches("tok", { gameMode: 0, page: 1, itemsPerPage: 25 }));
});

test("getChatLogByFloId reads the by-flo-id chat route", async () => {
  const { service, calls } = serviceWith({ status: 200, body: { players: [], messages: [], events: [] } });

  await service.getChatLogByFloId("tok", 4242);

  assert.equal(calls[0].url, "https://api.example.com/api/replays/by-flo-id/4242/chats");
});
