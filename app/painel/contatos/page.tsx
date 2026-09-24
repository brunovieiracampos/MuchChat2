import { buildContacts } from "@/lib/activity";
import { getActivity } from "@/lib/panel";
import { requireSession } from "@/lib/session";
import { ContactList } from "./list";

export default async function Contatos() {
  await requireSession();
  const { executions } = await getActivity();
  const contacts = buildContacts(executions);
  const history = Object.fromEntries(contacts.map((c) => [c.username, executions
    .filter((e) => (e.username || "desconhecido") === c.username)
    .slice(0, 20)
    .map((e) => ({ id: e.commentId, rule: e.ruleName, text: e.text ?? "", status: e.status, at: e.startedAt }))]));
  return <ContactList contacts={contacts} history={history} />;
}
