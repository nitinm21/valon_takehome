import { CreateDeck } from "../components/CreateDeck";

// The deck-creation flow (prompt/paste -> editable outline -> generate). Lives at
// its own route so the home screen (`/`) can be the deck library.
export default function CreatePage() {
  return <CreateDeck />;
}
