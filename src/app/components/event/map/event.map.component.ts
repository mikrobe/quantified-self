import {ChangeDetectionStrategy, Component, Input, ViewChild} from '@angular/core';
import seedColor from 'seed-color';
import {ActivityInterface} from '../../../entities/activities/activity.interface';
import {AgmMap, GoogleMapsAPIWrapper, LatLngBoundsLiteral} from '@agm/core';
import {PointInterface} from '../../../entities/points/point.interface';
import {EventInterface} from '../../../entities/events/event.interface';


@Component({
  selector: 'app-event-map',
  templateUrl: './event.map.component.html',
  styleUrls: ['./event.map.component.css'],
  providers: [GoogleMapsAPIWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush

})
export class EventMapComponent {
  @Input() event: EventInterface;
  @ViewChild(AgmMap) agmMap;

  constructor() {
  }

  fitBounds(): LatLngBoundsLiteral {
    const pointsWithPosition = this.event.getPointsWithPosition();
    const mostEast = pointsWithPosition.reduce((acc: PointInterface, point: PointInterface) => {
      return (acc.getPosition().longitudeDegrees < point.getPosition().longitudeDegrees) ? point : acc;
    });
    const mostWest = pointsWithPosition.reduce((acc: any, point: PointInterface) => {
      return (acc.getPosition().longitudeDegrees > point.getPosition().longitudeDegrees) ? point : acc;
    });
    const mostNorth = pointsWithPosition.reduce((acc: any, point: PointInterface) => {
      return (acc.getPosition().latitudeDegrees < point.getPosition().latitudeDegrees) ? point : acc;
    });
    const mostSouth = pointsWithPosition.reduce((acc: any, point: PointInterface) => {
      return (acc.getPosition().latitudeDegrees > point.getPosition().latitudeDegrees) ? point : acc;
    });
    return <LatLngBoundsLiteral>{
      east: mostEast.getPosition().longitudeDegrees,
      west: mostWest.getPosition().longitudeDegrees,
      north: mostNorth.getPosition().latitudeDegrees,
      south: mostSouth.getPosition().latitudeDegrees
    };
  }


  getActivityColor(seed: string): string {
    return seedColor(seed).toHex();
  }

  ngAfterViewInit() {
    console.log(this.agmMap);
  }
}
