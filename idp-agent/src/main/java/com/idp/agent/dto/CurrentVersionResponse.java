package com.idp.agent.dto;

public class CurrentVersionResponse {
  private boolean type;
  private String version;

  public void setType(boolean type){
    this.type = type;
  }

  public boolean getType(){
    return this.type;
  }

  public void setVersion(String version){
    this.version = version;
  }

  public String getVersion(){
    return this.version;
  }
}
