package com.idp.agent.enums;

public enum MessageProcess {
  PONG("pong"),
  HANDSHAKE_ACK("handshake_ack"),
  UPDATE("update"),
  GET_APP_CONFIG("get_app_config"),
  UPDATE_APP_CONFIG("update_app_config"),
  RESTART_APP("restart_app"),
  GET_APP_LOGS("get_app_logs"),
  UPDATE_AGENT("update_agent"),
  RUN_DEPLOY("run_deploy"),
  UPLOAD_LANGUAGES("upload_languages"),
  ARTIFACT_DEPLOY("artifact_deploy"),
  ARTIFACT_ROLLBACK("artifact_rollback"),
  ARTIFACT_CANCEL("artifact_cancel"),
  ARTIFACT_STATUS("artifact_status");

  private final String value;

  private MessageProcess(String value) {
    this.value = value;
  }

  public String getValue(){
    return this.value;
  }

  
}
