package com.idp.agent.dto;

import java.time.LocalDateTime;

public class Message {
  private String date;
  private String type;
  private String agentId;
  private String process;
  private Object payload;

  public Message(LocalDateTime date, String type, String agentId, String process) {
    this.date = date != null ? date.toString() : LocalDateTime.now().toString();
    this.type = type;
    this.agentId = agentId;
    this.process = process;
  }

  public Message(LocalDateTime date, String type, String agentId, String process, Object payload) {
    this.date = date != null ? date.toString() : LocalDateTime.now().toString();
    this.type = type;
    this.agentId = agentId;
    this.process = process;
    this.payload = payload;
  }
  
  public void updatePayload(Object newPayload) {
    this.date = LocalDateTime.now().toString();
    this.payload = newPayload;
  }

  public String getDate() {
    return date;
  }

  public void setDate(String date) {
    this.date = date;
  }

  public String getType() {
    return type;
  }

  public void setType(String type) {
    this.type = type;
  }

  public String getAgentId() {
    return agentId;
  }

  public void setAgentId(String agentId) {
    this.agentId = agentId;
  }

  public String getProcess() {
    return process;
  }

  public void setProcess(String process) {
    this.process = process;
  }

  public Object getPayload() {
    return payload;
  }

  public void setPayload(Object payload) {
    this.payload = payload;
  }
}
