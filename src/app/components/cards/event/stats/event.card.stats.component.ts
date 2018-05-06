import {ChangeDetectionStrategy, Component, Input, OnChanges} from '@angular/core';
import {EventInterface} from '../../../../entities/events/event.interface';
import {MatTableDataSource} from '@angular/material';
import {DataInterface} from '../../../../entities/data/data.interface';

@Component({
  selector: 'app-event-card-stats',
  templateUrl: './event.card.stats.component.html',
  styleUrls: ['./event.card.stats.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})

export class EventCardStatsComponent implements OnChanges {
  @Input() event: EventInterface;
  data: MatTableDataSource<Object>;
  columns: Array<Object>;

  ngOnChanges() {
    // Collect all the stat types from all the activities
    const stats = this.event.getActivities().reduce((statsMap, activity) => {
      Array.from(activity.getStats().values()).forEach((stat) => {
        statsMap.set(stat.getClassName(), stat);
      });
      return statsMap;
    }, new Map<string, DataInterface>());

    // Create the data as rows
    const data = Array.from(stats.values()).reduce((array, stat) => {
      array.push(
        this.event.getActivities().reduce((rowObj, activity, index) => {
          rowObj['#' + index + ' ' + activity.creator.name] =
            (activity.getStat(stat.getClassName()) ? activity.getStat(stat.getClassName()).getDisplayValue() : '') +
            ' ' +
            (activity.getStat(stat.getClassName()) ? activity.getStat(stat.getClassName()).getDisplayUnit() : '');
          return rowObj;
        }, {Name: stat.getType()})
      );
      return array;
    }, []);

    // Get the columns
    this.columns = (Object.keys(data[0]));
    // Set the data
    this.data = new MatTableDataSource(data);
  }

  applyFilter(filterValue: string) {
    filterValue = filterValue.trim(); // Remove whitespace
    filterValue = filterValue.toLowerCase(); // MatTableDataSource defaults to lowercase matches
    this.data.filter = filterValue;
  }
}
