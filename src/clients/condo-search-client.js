import axios from 'axios';
import BaseClient from './base-client';

// the high-level purpose of this is: take an address, geocode it, and put
// the result in state.
class CondoSearchClient extends BaseClient {

  evaluateDataForUnits(data) {
    // console.log('condo-search-client evaluateDataForUnit, data:', data);

    var units = [], filteredData, dataList = [];
    let groupedData = _.groupBy(data, a => a.properties.pwd_parcel_id);

    for (let item in groupedData){
      units.push.apply(units, groupedData[item]);
      // groupedData[item].length > 1 ? units.push.apply(units,groupedData[item]) :
      // dataList.push(groupedData[item][0])
    }
    let mObj = JSON.parse(JSON.stringify(data[0]));

    units.length > 0 ? units = _.groupBy(units, a => a.properties.pwd_parcel_id) : "";
    this.store.commit('setUnits', units);

    return data;
  }

  setFeatureProperties(feature, totalUnits) {
    console.log('condo setFeatureProperties is running, feature:', feature, 'totalUnits:', totalUnits);
    // console.log('this.store.state.parcels.pwd[0].properties.ADDRESS:', this.store.state.parcels.pwd[0].properties.ADDRESS);

    feature.properties.opa_owners = [ "Condominium (" + totalUnits + " Units)" ];
    if (this.store.state.parcels.pwd) {
      feature.properties.street_address = this.store.state.parcels.pwd[0].properties.ADDRESS;
      feature.properties.opa_address = this.store.state.parcels.pwd[0].properties.ADDRESS;
      feature.properties.pwd_parcel_id = this.store.state.parcels.pwd[0].properties.PARCELID;
      feature._featureId = this.store.state.parcels.pwd[0].properties.PARCELID;
      feature.condo = true;
    } else {
      console.log('setFeatureProperties is still running', this.store.state.condoUnits.units[Object.keys(this.store.state.condoUnits.units)[0]][0]);
      let record = this.store.state.condoUnits.units[Object.keys(this.store.state.condoUnits.units)[0]][0];
      console.log("No pwd parcels, showing feature: ", record, record.properties);
      let address = record.properties.address_low + " " + record.properties.street_full;
      let parcelId = record.properties.dor_parcel_id;

      feature.properties.street_address = address;
      feature.properties.opa_address = address;
      // feature.properties.pwd_parcel_id = parcelId;
      feature.properties.dor_parcel_id = parcelId;
      feature._featureId = parcelId;
      feature.condo = true;
    }

  }

  fetch(input) {
    console.log('condo-search-client fetch is running');
    this.store.commit('setCondoUnitsStatus', 'waiting');
    const store = this.store;
    let condoConfig = JSON.parse(JSON.stringify(this.config.geocoder));
    condoConfig.url = this.config.geocoder.url;

    condoConfig.params.include_units = true;

    const url = condoConfig.url(input);
    const params = condoConfig.params;
    if (params.page) {
      delete params['page'];
    }
    console.log('condo-search-client fetch is running, input', input, 'params:', params);

    // update state
    // this.store.commit('setGeocodeStatus', 'waiting');

    const success = this.success.bind(this);
    const error = this.error.bind(this);

    // return a promise that can accept further chaining
    return axios.get(url, { params })
      .then(success)
      .catch(error);
  }

  success(response) {
    // console.log('condo success is running');
    const store = this.store;
    const data = response.data;
    let features = data.features;
    const url = response.config.url;
    let params = response.config.params;
    const totalUnits = data.total_size;
    console.log('condo geocode success, url:', url, 'data:', data, 'params:', params, 'totalUnits:', totalUnits);

    if (!data.features || data.features.length < 1) {
      return;
    }

    async function getPages(features) {
      console.log('getPages is running still going 2, pages:' );

      let pages = Math.ceil(data.total_size / 100);

      if (pages > 1) {
        for (let counter = 2; counter<=pages; counter++) {
          // console.log('in loop, counter:', counter, this);
          params.page = counter;
          let pageResponse = await axios.get(url, { params });
          features = await features.concat(pageResponse.data.features);
          // console.log('response:', pageResponse, 'features:', features)
        }
      }

      let units = features.filter(a => a.properties.unit_num != "");
      units = this.evaluateDataForUnits(units);

      var feature = JSON.parse(JSON.stringify(units[0]));
      for (let i in feature.properties) {
        feature.properties[i] = "";
      }

      if(this.store.state.parcels.pwd === null) {
        this.setFeatureProperties(feature, totalUnits);

        console.log('condo-search-client, getPages else is still running 1');
        store.commit('setGeocodeData', feature);
        store.commit('setGeocodeStatus', 'success');
        // console.log('getPages else is still running 2');
        if (this.store.state.lastSearchMethod !== 'reverseGeocode') {
          this.store.commit('setLastSearchMethod', 'geocode');
        }
        // console.log('feature:', feature);
      } else {
        this.setFeatureProperties(feature, totalUnits);

        console.log('condo-search-client getPages else is still running 1');
        store.commit('setGeocodeData', feature);
        store.commit('setGeocodeStatus', 'success');
        // console.log('getPages else is still running 2');
        if (this.store.state.lastSearchMethod !== 'reverseGeocode') {
          this.store.commit('setLastSearchMethod', 'geocode');
        }
        // console.log('feature:', feature);
      }

      this.store.commit('setCondoUnitsStatus', 'success');
      return feature;
      // }
    }

    getPages = getPages.bind(this);
    return getPages(features);
  }

  error(error) {
    const store = this.store;

    store.commit('setCondoUnitsStatus', 'error');
    store.commit('setGeocodeStatus', 'error');
    store.commit('setGeocodeData', null);
    store.commit('setGeocodeRelated', null);
  }
}

export default CondoSearchClient;
