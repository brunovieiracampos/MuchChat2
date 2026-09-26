import { beforeEach } from "vitest";
import { setAccountForTests, testAccountCtx } from "@/lib/account-context";

// Cada teste roda numa conta de teste nova (automações em memória, prefixo a:acc-test: no Redis).
beforeEach(() => setAccountForTests(testAccountCtx()));
