package com.idp.agent.deploy;

/** İptal ({@code artifact_cancel}) ya da global zaman aşımı; mesajı sonuçtaki hata kodudur. */
public final class CancelledException extends DeployException {
	private static final long serialVersionUID = 1L;

	private final CancelToken.Reason reason;

	public CancelledException(CancelToken.Reason reason) {
		super(reason.code());
		this.reason = reason;
	}

	public CancelToken.Reason reason() {
		return reason;
	}
}
