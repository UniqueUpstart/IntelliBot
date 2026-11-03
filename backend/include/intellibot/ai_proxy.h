#pragma once

#include <string>

namespace intellibot {

struct AiResponse {
  bool connected = false;
  int status = 0;
  std::string body;
};

class AiProxy {
 public:
  explicit AiProxy(const std::string& url);
  AiResponse chat(const std::string& body, const std::string& idempotency_key) const;

 private:
  std::string host_;
  int port_ = 0;
};

}  // namespace intellibot
