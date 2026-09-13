package com.idp.agent.deploy;

/** {@code runtime.type} değerleri (sözleşme 1.2). */
public enum RuntimeType {
	NSSM("nssm", true),
	WINDOWS_SERVICE("windows-service", true),
	IIS_STATIC("iis-static", false),
	SYSTEMD("systemd", true),
	NONE("none", false);

	private final String wire;
	private final boolean service;

	RuntimeType(String wire, boolean service) {
		this.wire = wire;
		this.service = service;
	}

	public String wire() {
		return wire;
	}

	/** nssm / windows-service / systemd için {@code serviceName} zorunludur. */
	public boolean requiresServiceName() {
		return service;
	}

	public static RuntimeType fromWire(String value) {
		if (value == null) {
			return null;
		}
		for (RuntimeType type : values()) {
			if (type.wire.equals(value)) {
				return type;
			}
		}
		return null;
	}
}
