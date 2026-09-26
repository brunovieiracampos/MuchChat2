import { redirect } from "next/navigation";

/** A espera do teste fechado acabou: cada conta tem o próprio painel. Links antigos vão para lá. */
export default function Aguardando() {
  redirect("/painel");
}
