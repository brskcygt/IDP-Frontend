package com.idp.agent.dto;

public class PostResult {
  private final int statusCode;
  private final String body;

  public PostResult(int statusCode, String body) {
    this.statusCode = statusCode;
    this.body = body;
  }

  public int getStatusCode() {
    return statusCode;
  }

  public String getBody() {
    return body;
  }
}
