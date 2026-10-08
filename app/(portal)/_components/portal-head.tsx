import Link from "next/link";
import { initials } from "@/app/painel/_components/icons";

/** Topo do portal: de quem é e, na página de um material, o caminho de volta para a biblioteca. */
export function PortalHead({ username, back }: { username: string; back?: boolean }) {
  return (
    <header className="pt-head">
      <span className="pt-avatar" aria-hidden>{initials(username)}</span>
      <span style={{ minWidth: 0 }}>
        <span className="pt-head-name" style={{ display: "block" }}>@{username}</span>
        <a className="pt-head-sub" href={`https://www.instagram.com/${username}/`} target="_blank" rel="noopener noreferrer">Ver no Instagram</a>
      </span>
      {back && <Link className="pt-back" href={`/m/${username}`}>Todos os materiais</Link>}
    </header>
  );
}
