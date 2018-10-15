import Controller from './controller';
import pvdStore from './store';

function controllerMixin(Vue, opts) {
  const controller = new Controller(opts);

  Vue.mixin({
    created() {
      this.$controller = controller;
    }
  });
}

export default { controllerMixin, pvdStore };
