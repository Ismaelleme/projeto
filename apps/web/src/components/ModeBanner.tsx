import { Icon } from "./Icon";

export function ModeBanner() {
  return (
    <div className="mode-banner" role="status">
      <span className="mode-banner__stripe" aria-hidden="true" />
      <span className="mode-banner__item">
        <span className="mode-banner__dot" aria-hidden="true" />
        Ambiente demonstrativo
      </span>
      <span className="mode-banner__item mode-banner__item--strong">
        Verificação simulada
      </span>
      <span className="mode-banner__item">
        <Icon name="camera-off" size={14} />
        Sem câmera ou biometria real
      </span>
      <span className="mode-banner__item">
        <Icon name="gate" size={14} />
        Sem acesso físico
      </span>
    </div>
  );
}
