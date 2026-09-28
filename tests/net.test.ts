import { describe, expect, it } from "vitest";
import { isPrivateIp } from "@/lib/net";

describe("endereços bloqueados no download por link", () => {
  it("bloqueia rede interna, loopback, metadados e tradução IPv6↔IPv4", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.4", "192.168.1.1", "100.64.0.1", "198.18.0.1", "224.0.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "2002:a00:1::"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it("libera endereços públicos", () => {
    for (const ip of ["8.8.8.8", "151.101.1.140", "2606:4700::6810:84e5"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
});
