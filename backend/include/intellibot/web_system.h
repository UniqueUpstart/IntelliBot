#pragma once
#include <httplib.h>

#include <memory>
#include <string>
namespace intellibot {
class WebSystem {
 public:
  /* share_dev_api：只接管 /api/v1/auth/*，其余路径原样交回调用方。
     --legacy-dev 那种「同一进程里既有账号系统又有仿真开发接口」的跑法用它 */
  explicit WebSystem(const std::string& path, bool share_dev_api = false);
  ~WebSystem();
  bool handle(const httplib::Request&, httplib::Response&);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
}  // namespace intellibot
