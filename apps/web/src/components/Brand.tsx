import { Link } from "react-router-dom";
import { Icon } from "./Icon";

export function Brand({ to, light = false }: { to: string; light?: boolean }) {
  return (
    <Link
      to={to}
      className={`brand ${light ? "brand--light" : ""}`}
      aria-label="Usina Lins — início do portal"
    >
      <span className="brand__mark" aria-hidden="true">
        <Icon name="gate" size={22} />
      </span>
      <span className="brand__text">
        <span className="brand__eyebrow">Usina Lins</span>
        <span className="brand__name">Controle de acesso</span>
      </span>
    </Link>
  );
}
