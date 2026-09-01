package com.idp.agent.dto;

public class LanguageUploadPayload {
  private String platform;
  private String lang;
  private String path;
  private String texts;

  public String getPlatform() {
    return platform;
  }

  public String getLang() {
    return lang;
  }

  public String getPath() {
    return path;
  }

  public String getTexts() {
    return texts;
  }

  public boolean isValid() {
    return isFilled(platform) && isFilled(lang) && isFilled(path) && isFilled(texts);
  }

  private boolean isFilled(String value) {
    return value != null && !value.isEmpty();
  }
}
