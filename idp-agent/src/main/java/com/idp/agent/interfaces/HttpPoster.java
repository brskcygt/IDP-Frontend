package com.idp.agent.interfaces;

import com.idp.agent.dto.PostResult;

public interface HttpPoster {
  PostResult post(String url, String body) throws Exception;
}
