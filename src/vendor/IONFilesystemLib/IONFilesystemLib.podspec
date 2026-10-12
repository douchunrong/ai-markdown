Pod::Spec.new do |s|
  s.name         = 'IONFilesystemLib'
  s.version      = '1.1.2'
  s.summary      = 'Library for accessing iOS filesystem.'
  s.description  = 'A Swift library for iOS that provides access to the native file system. (Local vendored copy of https://github.com/ionic-team/ion-ios-filesystem 1.1.2, 避免构建环境无法访问 github.com)'
  s.homepage     = 'https://github.com/ionic-team/ion-ios-filesystem'
  s.license      = { :type => 'MIT', :file => 'LICENSE' }
  s.authors      = { 'OutSystems Mobile Ecosystem' => 'rd.mobileecosystem.team@outsystems.com' }
  s.source       = { :path => '.' }
  s.vendored_frameworks = 'IONFilesystemLib.xcframework'
  s.ios.deployment_target = '14.0'
  s.swift_version = '5.9'
end
