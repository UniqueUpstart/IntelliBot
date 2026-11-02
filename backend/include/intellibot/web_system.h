#pragma once
#include <httplib.h>
#include <memory>
#include <string>
namespace intellibot {
class WebSystem {
 public:
  explicit WebSystem(const std::string& path);
  ~WebSystem();
  bool handle(const httplib::Request&, httplib::Response&);
 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
}
